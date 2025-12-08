import { Context } from 'telegraf';
import { ensureTodayMorningRow, getMorningStatus, getMorningRoutineTasksDynamic, getPageNonCheckboxProperties, ensureTodayDayRow, getDayStatus, getDayRoutineTasksDynamic, getDayRoutineStatuses, getDayRoutineTasksByStatus } from '../services/notion';
import { userStateService } from '../services/userState';
import { keyboardService } from '../keyboards';

/**
 * Обработчики команд бота.
 * Каждый обработчик отвечает за одну команду.
 */
export class CommandHandlers {
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
    const messageIds = userStateService.getUserBotMessages(userId);
    console.log(`[DEBUG] User ${userId}: Found ${messageIds.length} messages to delete`);
    
    if (messageIds && messageIds.length > 0) {
      try {
        // Удаляем сообщения в обратном порядке (от новых к старым)
        // Создаем копию массива, чтобы не изменять оригинал
        const messagesToDelete = [...messageIds].reverse();
        let deletedCount = 0;
        let errorCount = 0;
        
        for (const msgId of messagesToDelete) {
          try {
            await ctx.telegram.deleteMessage(chatId, msgId);
            deletedCount++;
            // Небольшая задержка между удалениями, чтобы не превысить rate limit
            await new Promise(resolve => setTimeout(resolve, 50));
          } catch (error: any) {
            errorCount++;
            // Игнорируем ошибки удаления (сообщение уже удалено, недоступно или старше 48 часов)
            const errorMessage = error.message || '';
            if (
              !errorMessage.includes('message to delete not found') &&
              !errorMessage.includes('message can\'t be deleted') &&
              !errorMessage.includes('bad request') &&
              !errorMessage.includes('message not found')
            ) {
              console.error(`[DEBUG] Error deleting message ${msgId}:`, errorMessage);
            }
          }
        }
        console.log(`[DEBUG] Deleted ${deletedCount} messages, ${errorCount} errors`);
      } catch (error: any) {
        console.error('Error deleting messages:', error);
      }
      // Очищаем список сообщений
      userStateService.clearUserBotMessages(userId);
    }
    
    // Отправляем новое сообщение с главным меню
    const sentMessage = await ctx.reply(
      'Привет! 👋\n' +
      'Я бот для записи задач в Notion.\n\n' +
      'Выбери действие из меню ниже:',
      keyboardService.getMainMenuKeyboard()
    );
    
    // Сохраняем ID нового сообщения
    userStateService.trackBotMessage(userId, sentMessage.message_id);
    console.log(`[DEBUG] Tracked new message ${sentMessage.message_id} for user ${userId}`);
  }

  /**
   * Обработчик команды /menu.
   * Показывает главное меню.
   */
  async handleMenu(ctx: Context): Promise<void> {
    const sentMessage = await ctx.reply(
      'Главное меню:\n\nВыбери действие:',
      keyboardService.getMainMenuKeyboard()
    );
    userStateService.trackBotMessage(ctx.from!.id, sentMessage.message_id);
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
      
      let message = '🌅 *Доброе утро!*\n\n';
      
      // Динамически выводим все не-чекбокс поля
      nonCheckboxProps.forEach(prop => {
        message += `${prop.name}: *${prop.value}*\n`;
      });
      
      if (nonCheckboxProps.length > 0) {
        message += '\n';
      }
      
      message += 'Что ты уже сделал из утренней рутины сегодня?';
      
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
    let loadingMsg: any = null;
    try {
      // Показываем индикатор загрузки
      loadingMsg = await ctx.reply('⏳ Загружаю статусы...');
      userStateService.trackBotMessage(ctx.from!.id, loadingMsg.message_id);
      
      const statuses = await getDayRoutineStatuses();
      const keyboard = await keyboardService.getDayRoutineStatusesKeyboard();
      
      const message = '🕒 *Дневные задачи*\n\nВыбери статус:';
      
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
    let loadingMsg: any = null;
    try {
      // Показываем индикатор загрузки
      loadingMsg = await ctx.reply('⏳ Загружаю статусы...');
      userStateService.trackBotMessage(ctx.from!.id, loadingMsg.message_id);
      
      const { getLaterTasksStatuses } = await import('../services/notion');
      const statuses = await getLaterTasksStatuses();
      const keyboard = await keyboardService.getLaterTasksStatusesKeyboard();
      
      const message = '📝 *Позже*\n\nВыбери статус:';
      
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

