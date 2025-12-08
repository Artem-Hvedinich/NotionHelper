import { Context } from 'telegraf';
import { ensureTodayMorningRow, getMorningStatus, getMorningRoutineTasksDynamic, getPageNonCheckboxProperties, ensureTodayDayRow, getDayStatus, getDayRoutineTasksDynamic, getDayRoutineStatuses, getDayRoutineTasksByStatus } from '../services/notion';
import { userStateService } from '../services/userState';
import { keyboardService } from '../keyboards';
import { createHeader, formatRoutineStats, formatTaskList, formatMainMenu, formatDatabaseSelection, formatDayStatusSelection, formatLaterStatusSelection } from '../utils/formatter';

/**
 * Обработчики команд бота.
 * Каждый обработчик отвечает за одну команду.
 */
export class CommandHandlers {
  /**
   * Вспомогательная функция для удаления всех сообщений бота и пользователя (кроме главного меню).
   */
  private async clearBotMessages(ctx: Context): Promise<void> {
    const userId = ctx.from!.id;
    const chatId = ctx.chat!.id;
    const botMessageIds = userStateService.getUserBotMessages(userId);
    const userMessageIds = userStateService.getUserMessages(userId);
    const mainMenuMessageId = userStateService.getMainMenuMessage(userId);
    
    // Удаляем сообщения бота
    if (botMessageIds && botMessageIds.length > 0) {
      try {
        // Удаляем сообщения в обратном порядке (от новых к старым)
        // Исключаем сообщение с главным меню
        const messagesToDelete = [...botMessageIds]
          .filter(msgId => msgId !== mainMenuMessageId)
          .reverse();
        
        for (const msgId of messagesToDelete) {
          try {
            await ctx.telegram.deleteMessage(chatId, msgId);
            // Небольшая задержка между удалениями, чтобы не превысить rate limit
            await new Promise(resolve => setTimeout(resolve, 50));
          } catch (error: any) {
            // Игнорируем ошибки удаления (сообщение уже удалено, недоступно или старше 48 часов)
            const errorMessage = error.message || '';
            if (
              !errorMessage.includes('message to delete not found') &&
              !errorMessage.includes('message can\'t be deleted') &&
              !errorMessage.includes('bad request') &&
              !errorMessage.includes('message not found')
            ) {
              // Тихо игнорируем остальные ошибки
            }
          }
        }
      } catch (error: any) {
        // Игнорируем общие ошибки
      }
      // Очищаем список сообщений, но сохраняем главное меню
      if (mainMenuMessageId) {
        userStateService.clearUserBotMessages(userId);
        userStateService.trackBotMessage(userId, mainMenuMessageId);
      } else {
        userStateService.clearUserBotMessages(userId);
      }
    }
    
    // Удаляем сообщения пользователя
    if (userMessageIds && userMessageIds.length > 0) {
      try {
        // Удаляем сообщения пользователя в обратном порядке
        const messagesToDelete = [...userMessageIds].reverse();
        
        for (const msgId of messagesToDelete) {
          try {
            await ctx.telegram.deleteMessage(chatId, msgId);
            // Небольшая задержка между удалениями, чтобы не превысить rate limit
            await new Promise(resolve => setTimeout(resolve, 50));
          } catch (error: any) {
            // Игнорируем ошибки удаления (сообщение уже удалено, недоступно или старше 48 часов)
            const errorMessage = error.message || '';
            if (
              !errorMessage.includes('message to delete not found') &&
              !errorMessage.includes('message can\'t be deleted') &&
              !errorMessage.includes('bad request') &&
              !errorMessage.includes('message not found')
            ) {
              // Тихо игнорируем остальные ошибки
            }
          }
        }
      } catch (error: any) {
        // Игнорируем общие ошибки
      }
      // Очищаем список сообщений пользователя
      userStateService.clearUserMessages(userId);
    }
  }

  /**
   * Обработчик команды /start.
   * Удаляет все предыдущие сообщения бота и показывает меню выбора базы.
   */
  async handleStart(ctx: Context): Promise<void> {
    const userId = ctx.from!.id;
    const chatId = ctx.chat!.id;
    
    // Пытаемся удалить команду /start от пользователя
    // В личных чатах это может не работать из-за ограничений Telegram API
    try {
      if (ctx.message && 'message_id' in ctx.message) {
        await ctx.deleteMessage();
      }
    } catch (error: any) {
      // Игнорируем ошибки - в личных чатах бот не может удалять сообщения пользователя
      // Это нормальное поведение Telegram API
    }
    
    // Удаляем все предыдущие сообщения бота
    await this.clearBotMessages(ctx);
    
    // Отправляем новое сообщение с главным меню
    const sentMessage = await ctx.reply(
      formatMainMenu(),
      { parse_mode: 'Markdown', ...keyboardService.getMainMenuKeyboard() }
    );
    
    // Сохраняем ID нового сообщения с главным меню
    userStateService.setMainMenuMessage(userId, sentMessage.message_id);
    userStateService.trackBotMessage(userId, sentMessage.message_id);
    console.log(`[DEBUG] Tracked new message ${sentMessage.message_id} for user ${userId}`);
  }

  /**
   * Обработчик команды /menu.
   * Показывает главное меню.
   */
  async handleMenu(ctx: Context): Promise<void> {
    const userId = ctx.from!.id;
    const sentMessage = await ctx.reply(
      'Главное меню:\n\nВыбери действие:',
      keyboardService.getMainMenuKeyboard()
    );
    // Сохраняем ID сообщения с главным меню
    userStateService.setMainMenuMessage(userId, sentMessage.message_id);
    userStateService.trackBotMessage(userId, sentMessage.message_id);
  }

  /**
   * Обработчик команд /mode, /db, /choose.
   * Показывает меню выбора базы данных.
   */
  async handleDatabaseSelection(ctx: Context): Promise<void> {
    const sentMessage = await ctx.reply(
      'Выбери базу, с которой будем работать:',
      keyboardService.getDatabaseKeyboard()
    );
    userStateService.trackBotMessage(ctx.from!.id, sentMessage.message_id);
  }

  /**
   * Обработчик команды /morning.
   * Показывает чеклист утренней рутины с текущей статистикой.
   */
  async handleMorning(ctx: Context): Promise<void> {
    // Очищаем предыдущие сообщения бота
    await this.clearBotMessages(ctx);
    
    let loadingMsg: any = null;
    try {
      // Показываем индикатор загрузки
      loadingMsg = await ctx.reply('⏳ Загружаю утреннюю рутину...');
      userStateService.trackBotMessage(ctx.from!.id, loadingMsg.message_id);
      
      const pageId = await ensureTodayMorningRow();
      const tasks = await getMorningRoutineTasksDynamic();
      const status = await getMorningStatus(pageId, tasks);
      const nonCheckboxProps = await getPageNonCheckboxProperties(pageId);
      const keyboard = await keyboardService.getMorningRoutineKeyboard(status);
      
      // Подсчитываем выполненные и оставшиеся задачи
      const completedTasks = tasks.filter(task => status[task.propertyName]);
      const pendingTasks = tasks.filter(task => !status[task.propertyName]);
      
      // Формируем сообщение с улучшенным форматированием
      let message = createHeader('Утренняя рутина', '🌅', 20);
      message += '\n';
      
      // Статистика
      const score = nonCheckboxProps.find(p => p.name.toLowerCase().includes('оценка') || p.name.toLowerCase().includes('score'));
      const additionalStats = nonCheckboxProps
        .filter(p => !p.name.toLowerCase().includes('оценка') && !p.name.toLowerCase().includes('score'))
        .map(p => ({ name: p.name, value: p.value }));
      
      message += formatRoutineStats(
        completedTasks.length,
        tasks.length,
        score?.value,
        additionalStats
      );
      
      // Список задач
      message += formatTaskList(completedTasks, pendingTasks, true);
      
      message += '\n*Что ты уже сделал сегодня?*';
      
      // Удаляем сообщение "Загружаю..." и отправляем новое сообщение
      try {
        if (loadingMsg) {
          await ctx.telegram.deleteMessage(ctx.chat!.id, loadingMsg.message_id);
        }
      } catch (deleteError: any) {
        // Игнорируем ошибки удаления
      }
      
      const sentMessage = await ctx.reply(message, { parse_mode: 'Markdown', ...keyboard });
      userStateService.trackBotMessage(ctx.from!.id, sentMessage.message_id);
    } catch (error: any) {
      console.error('Error fetching morning routine:', error);
      // Удаляем сообщение "Загружаю..." при ошибке
      try {
        if (loadingMsg) {
          await ctx.telegram.deleteMessage(ctx.chat!.id, loadingMsg.message_id);
        }
      } catch (deleteError: any) {
        // Игнорируем ошибки удаления
      }
      const errorMsg = await ctx.reply(`❌ Ошибка: ${error.message}`);
      userStateService.trackBotMessage(ctx.from!.id, errorMsg.message_id);
    }
  }

  /**
   * Обработчик команды /morning_status.
   * Показывает текстовый статус утренней рутины.
   */
  async handleMorningStatus(ctx: Context): Promise<void> {
    let loadingMsg: any = null;
    try {
      // Показываем индикатор загрузки
      loadingMsg = await ctx.reply('⏳ Загружаю статус...');
      userStateService.trackBotMessage(ctx.from!.id, loadingMsg.message_id);
      
      const pageId = await ensureTodayMorningRow();
      const tasks = await getMorningRoutineTasksDynamic();
      const status = await getMorningStatus(pageId, tasks);
      const nonCheckboxProps = await getPageNonCheckboxProperties(pageId);
      
      let message = '🌅 *Утренняя рутина сегодня:*\n\n';
      tasks.forEach(task => {
        const isDone = status[task.propertyName];
        message += `${isDone ? '✅' : '⬜'} ${task.label}\n`;
      });

      // Динамически выводим все не-чекбокс поля
      if (nonCheckboxProps.length > 0) {
        message += '\n';
        nonCheckboxProps.forEach(prop => {
          message += `${prop.name}: *${prop.value}*\n`;
        });
      }
      
      // Удаляем сообщение "Загружаю..." и отправляем новое сообщение
      try {
        if (loadingMsg) {
          await ctx.telegram.deleteMessage(ctx.chat!.id, loadingMsg.message_id);
        }
      } catch (deleteError: any) {
        // Игнорируем ошибки удаления
      }
      
      const sentMessage = await ctx.reply(message, { parse_mode: 'Markdown' });
      userStateService.trackBotMessage(ctx.from!.id, sentMessage.message_id);
    } catch (error: any) {
      console.error('Error fetching morning status:', error);
      // Удаляем сообщение "Загружаю..." при ошибке
      try {
        if (loadingMsg) {
          await ctx.telegram.deleteMessage(ctx.chat!.id, loadingMsg.message_id);
        }
      } catch (deleteError: any) {
        // Игнорируем ошибки удаления
      }
      const errorMsg = await ctx.reply(`❌ Ошибка: ${error.message}`);
      userStateService.trackBotMessage(ctx.from!.id, errorMsg.message_id);
    }
  }

  /**
   * Обработчик команды /day.
   * Показывает список статусов для выбора.
   */
  async handleDay(ctx: Context): Promise<void> {
    // Очищаем предыдущие сообщения бота
    await this.clearBotMessages(ctx);
    
    let loadingMsg: any = null;
    try {
      // Показываем индикатор загрузки
      loadingMsg = await ctx.reply('⏳ Загружаю статусы...');
      userStateService.trackBotMessage(ctx.from!.id, loadingMsg.message_id);
      
      const statuses = await getDayRoutineStatuses();
      const keyboard = await keyboardService.getDayRoutineStatusesKeyboard();
      
      const message = formatDayStatusSelection();
      
      // Удаляем сообщение "Загружаю..." и отправляем новое сообщение
      try {
        if (loadingMsg) {
          await ctx.telegram.deleteMessage(ctx.chat!.id, loadingMsg.message_id);
        }
      } catch (deleteError: any) {
        // Игнорируем ошибки удаления
      }
      
      const sentMessage = await ctx.reply(message, { parse_mode: 'Markdown', ...keyboard });
      userStateService.trackBotMessage(ctx.from!.id, sentMessage.message_id);
    } catch (error: any) {
      console.error('Error fetching day routine statuses:', error);
      // Удаляем сообщение "Загружаю..." при ошибке
      try {
        if (loadingMsg) {
          await ctx.telegram.deleteMessage(ctx.chat!.id, loadingMsg.message_id);
        }
      } catch (deleteError: any) {
        // Игнорируем ошибки удаления
      }
      const errorMsg = await ctx.reply(`❌ Ошибка: ${error.message}`);
      userStateService.trackBotMessage(ctx.from!.id, errorMsg.message_id);
    }
  }

  /**
   * Обработчик команды /day_status.
   * Показывает текстовый статус дневной рутины.
   */
  async handleDayStatus(ctx: Context): Promise<void> {
    let loadingMsg: any = null;
    try {
      // Показываем индикатор загрузки
      loadingMsg = await ctx.reply('⏳ Загружаю дневную рутину...');
      userStateService.trackBotMessage(ctx.from!.id, loadingMsg.message_id);
      
      const pageId = await ensureTodayDayRow();
      const tasks = await getDayRoutineTasksDynamic();
      const status = await getDayStatus(pageId, tasks);
      const nonCheckboxProps = await getPageNonCheckboxProperties(pageId);
      
      let message = '🕒 *Дневная рутина сегодня:*\n\n';
      tasks.forEach(task => {
        const isDone = status[task.propertyName];
        message += `${isDone ? '✅' : '⬜'} ${task.label}\n`;
      });

      // Динамически выводим все не-чекбокс поля
      if (nonCheckboxProps.length > 0) {
        message += '\n';
        nonCheckboxProps.forEach(prop => {
          message += `${prop.name}: *${prop.value}*\n`;
        });
      }
      
      // Удаляем сообщение "Загружаю..." и отправляем новое сообщение
      try {
        if (loadingMsg) {
          await ctx.telegram.deleteMessage(ctx.chat!.id, loadingMsg.message_id);
        }
      } catch (deleteError: any) {
        // Игнорируем ошибки удаления
      }
      
      const sentMessage = await ctx.reply(message, { parse_mode: 'Markdown' });
      userStateService.trackBotMessage(ctx.from!.id, sentMessage.message_id);
    } catch (error: any) {
      console.error('Error fetching day status:', error);
      // Удаляем сообщение "Загружаю..." при ошибке
      try {
        if (loadingMsg) {
          await ctx.telegram.deleteMessage(ctx.chat!.id, loadingMsg.message_id);
        }
      } catch (deleteError: any) {
        // Игнорируем ошибки удаления
      }
      const errorMsg = await ctx.reply(`❌ Ошибка: ${error.message}`);
      userStateService.trackBotMessage(ctx.from!.id, errorMsg.message_id);
    }
  }

  /**
   * Обработчик команды /later.
   * Показывает список статусов для выбора.
   */
  async handleLater(ctx: Context): Promise<void> {
    // Очищаем предыдущие сообщения бота
    await this.clearBotMessages(ctx);
    
    let loadingMsg: any = null;
    try {
      // Показываем индикатор загрузки
      loadingMsg = await ctx.reply('⏳ Загружаю статусы...');
      userStateService.trackBotMessage(ctx.from!.id, loadingMsg.message_id);
      
      const { getLaterTasksStatuses } = await import('../services/notion');
      const statuses = await getLaterTasksStatuses();
      const keyboard = await keyboardService.getLaterTasksStatusesKeyboard();
      
      const message = formatLaterStatusSelection();
      
      // Удаляем сообщение "Загружаю..." и отправляем новое сообщение
      try {
        if (loadingMsg) {
          await ctx.telegram.deleteMessage(ctx.chat!.id, loadingMsg.message_id);
        }
      } catch (deleteError: any) {
        // Игнорируем ошибки удаления
      }
      
      const sentMessage = await ctx.reply(message, { parse_mode: 'Markdown', ...keyboard });
      userStateService.trackBotMessage(ctx.from!.id, sentMessage.message_id);
    } catch (error: any) {
      console.error('Error fetching later tasks statuses:', error);
      // Удаляем сообщение "Загружаю..." при ошибке
      try {
        if (loadingMsg) {
          await ctx.telegram.deleteMessage(ctx.chat!.id, loadingMsg.message_id);
        }
      } catch (deleteError: any) {
        // Игнорируем ошибки удаления
      }
      const errorMsg = await ctx.reply(`❌ Ошибка: ${error.message}`);
      userStateService.trackBotMessage(ctx.from!.id, errorMsg.message_id);
    }
  }
}

// Экспортируем singleton экземпляр
export const commandHandlers = new CommandHandlers();

