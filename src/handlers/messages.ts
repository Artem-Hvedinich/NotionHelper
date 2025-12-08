import { Context } from 'telegraf';
import { getDatabaseByKey, NotionDatabaseKey } from '../config/databases';
import { createPageInDatabase, updatePageProperty } from '../services/notion';
import { userStateService } from '../services/userState';
import { keyboardService } from '../keyboards';
import { commandHandlers } from './commands';
import { actionHandlers } from './actions';

/**
 * Обработчики текстовых сообщений от пользователей.
 */
export class MessageHandlers {
  /**
   * Обрабатывает текстовое сообщение от пользователя.
   */
  async handleText(ctx: Context): Promise<void> {
    // Проверяем, что это текстовое сообщение
    if (!ctx.message || !('text' in ctx.message) || !ctx.from) {
      return;
    }

    // Игнорируем команды
    if (ctx.message.text.startsWith('/')) return;

    const userId = ctx.from.id;
    const text = ctx.message.text;
    
    // Обработка кнопок главного меню
    if (await this.handleMainMenuButtons(ctx, text)) {
      return;
    }
    
    // Проверка режима редактирования поля
    const editMode = userStateService.getUserEditMode(userId);
    if (editMode) {
      await this.handleEditPropertyMode(ctx, editMode, text);
      return;
    }
    
    // 1. Проверка явного режима взаимодействия (пользователь нажал "Создать задачу")
    const state = userStateService.getUserMode(userId);

    if (state.mode === 'create' && state.dbKey) {
      await this.handleCreateMode(ctx, state.dbKey, text);
      return;
    }

    // 2. Fallback: Проверка запомненного выбора (Пользователь просто ввел текст без нажатия "Создать")
    const stickyKey = userStateService.getUserDatabase(userId);
    if (state.mode === 'idle' && stickyKey) {
      await this.handleQuickAdd(ctx, stickyKey, text);
      return;
    }

    // 3. Нет режима и нет выбора
    const sentMessage = await ctx.reply(
      '⚠️ Я не знаю, куда это сохранить.\nСначала выбери базу командой /db',
      keyboardService.getDatabaseKeyboard()
    );
    userStateService.trackBotMessage(userId, sentMessage.message_id);
  }

  /**
   * Обрабатывает создание задачи в явном режиме создания.
   */
  private async handleCreateMode(ctx: Context, dbKey: string, text: string): Promise<void> {
    const dbConfig = getDatabaseByKey(dbKey as any);
    
    try {
      const response = await ctx.reply(`⏳ Сохраняю в *${dbConfig.title}*...`, { parse_mode: 'Markdown' });
      userStateService.trackBotMessage(ctx.from!.id, response.message_id);
      
      const pageId = await createPageInDatabase({ databaseKey: dbKey as any, text });

      // Если это дневная рутина или "Позже", открываем задачу для редактирования
      if (dbKey === 'dayRoutine' || dbKey === 'laterTasks') {
        // Удаляем сообщение "Сохраняю..."
        try {
          await ctx.telegram.deleteMessage(ctx.chat!.id, response.message_id);
        } catch (error: any) {
          // Игнорируем ошибки удаления
        }
        
        // Открываем задачу для редактирования
        const shortId = userStateService.registerTaskId(pageId);
        if (dbKey === 'dayRoutine') {
          await actionHandlers.handleDayTaskOpenAfterCreate(ctx, shortId);
        } else if (dbKey === 'laterTasks') {
          await actionHandlers.handleLaterTaskOpenAfterCreate(ctx, shortId);
        }
      } else {
        // Для остальных баз просто показываем сообщение об успехе
        await ctx.telegram.editMessageText(
          ctx.chat!.id,
          response.message_id,
          undefined,
          `✅ Сохранил в базу «${dbConfig.title}».`,
          { parse_mode: 'Markdown' }
        );
      }

      // Сброс режима в idle после успеха
      userStateService.setUserMode(ctx.from!.id, 'idle');
    } catch (error: any) {
      console.error('Ошибка API Notion:', error);
      const errorMsg = await ctx.reply(`❌ Не удалось сохранить задачу. Попробуй позже.\nDebug: ${error.message || 'Unknown error'}`);
      userStateService.trackBotMessage(ctx.from!.id, errorMsg.message_id);
    }
  }

  /**
   * Обрабатывает быстрое добавление задачи (без явного режима создания).
   */
  private async handleQuickAdd(ctx: Context, dbKey: string, text: string): Promise<void> {
    const dbConfig = getDatabaseByKey(dbKey as any);
    try {
      const response = await ctx.reply(`⏳ Сохраняю в *${dbConfig.title}*...`, { parse_mode: 'Markdown' });
      userStateService.trackBotMessage(ctx.from!.id, response.message_id);
      const pageId = await createPageInDatabase({ databaseKey: dbKey as any, text });
      
      // Если это дневная рутина или "Позже", открываем задачу для редактирования
      if (dbKey === 'dayRoutine' || dbKey === 'laterTasks') {
        // Удаляем сообщение "Сохраняю..."
        try {
          await ctx.telegram.deleteMessage(ctx.chat!.id, response.message_id);
        } catch (error: any) {
          // Игнорируем ошибки удаления
        }
        
        // Открываем задачу для редактирования
        const shortId = userStateService.registerTaskId(pageId);
        if (dbKey === 'dayRoutine') {
          await actionHandlers.handleDayTaskOpenAfterCreate(ctx, shortId);
        } else if (dbKey === 'laterTasks') {
          await actionHandlers.handleLaterTaskOpenAfterCreate(ctx, shortId);
        }
      } else {
        // Для остальных баз просто показываем сообщение об успехе
        await ctx.telegram.editMessageText(
          ctx.chat!.id,
          response.message_id,
          undefined,
          `✅ Сохранил в базу «${dbConfig.title}».`,
          { parse_mode: 'Markdown' }
        );
      }
    } catch (error: any) {
      console.error('Ошибка API Notion:', error);
      const errorMsg = await ctx.reply(`❌ Не удалось сохранить задачу. Попробуй позже.\nDebug: ${error.message || 'Unknown error'}`);
      userStateService.trackBotMessage(ctx.from!.id, errorMsg.message_id);
    }
  }

  /**
   * Обрабатывает режим редактирования поля задачи.
   */
  private async handleEditPropertyMode(ctx: Context, editMode: { shortId: string; propertyName: string; propertyType: string }, text: string): Promise<void> {
    try {
      const pageId = userStateService.getTaskPageId(editMode.shortId);
      
      if (!pageId) {
        await ctx.reply('❌ Задача не найдена');
        userStateService.clearUserEditMode(ctx.from!.id);
        return;
      }

      // Парсим значение в зависимости от типа поля
      let value: string | number | boolean | { start: string } | null = text.trim();
      
      if (editMode.propertyType === 'number') {
        const numValue = parseFloat(text);
        if (isNaN(numValue)) {
          await ctx.reply('❌ Неверный формат числа. Попробуй еще раз:');
          return;
        }
        value = numValue;
      } else if (editMode.propertyType === 'date') {
        // Проверяем формат даты YYYY-MM-DD
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(text)) {
          await ctx.reply('❌ Неверный формат даты. Используй формат YYYY-MM-DD (например, 2024-12-25):');
          return;
        }
        value = { start: text };
      } else if (editMode.propertyType === 'checkbox') {
        value = text.toLowerCase() === 'true' || text.toLowerCase() === '1' || text.toLowerCase() === 'да';
      } else if (text.toLowerCase() === 'null' || text.toLowerCase() === 'удалить' || text.toLowerCase() === 'очистить') {
        value = null;
      }

      // Обновляем поле
      await updatePageProperty(pageId, editMode.propertyName, editMode.propertyType, value);
      
      // Очищаем режим редактирования
      userStateService.clearUserEditMode(ctx.from!.id);
      
      // Обновляем задачу через actionHandlers
      const { actionHandlers } = await import('./actions');
      // Определяем тип базы по pageId (можно улучшить, но для простоты используем refreshDayTask для всех)
      await actionHandlers.refreshDayTask(ctx, editMode.shortId);
      
      await ctx.reply(`✅ Поле "${editMode.propertyName}" обновлено`);
    } catch (error: any) {
      console.error('Error updating property:', error);
      await ctx.reply(`❌ Ошибка: ${error.message}`);
      userStateService.clearUserEditMode(ctx.from!.id);
    }
  }

  /**
   * Обрабатывает нажатия на кнопки главного меню.
   * Возвращает true, если сообщение было обработано как кнопка меню.
   */
  private async handleMainMenuButtons(ctx: Context, text: string): Promise<boolean> {
    const buttonMap: Record<string, () => Promise<void>> = {
      '☀️ Утро': () => commandHandlers.handleMorning(ctx),
      '🕒 День': async () => {
        // Показываем чеклист дневной рутины
        await commandHandlers.handleDay(ctx);
      },
      '🌙 Вечер': async () => {
        const dbKey: NotionDatabaseKey = 'eveningRoutine';
        userStateService.setUserDatabase(ctx.from!.id, dbKey);
        const dbConfig = getDatabaseByKey(dbKey);
        const sentMessage = await ctx.reply(
          `✅ Выбрана база: *${dbConfig.title}*\n\nЧто добавить?`,
          { parse_mode: 'Markdown', ...keyboardService.getActionsKeyboard(dbKey) }
        );
        userStateService.trackBotMessage(ctx.from!.id, sentMessage.message_id);
      },
      '💡 Привычки': async () => {
        const dbKey: NotionDatabaseKey = 'habits';
        userStateService.setUserDatabase(ctx.from!.id, dbKey);
        const dbConfig = getDatabaseByKey(dbKey);
        const sentMessage = await ctx.reply(
          `✅ Выбрана база: *${dbConfig.title}*\n\nЧто добавить?`,
          { parse_mode: 'Markdown', ...keyboardService.getActionsKeyboard(dbKey) }
        );
        userStateService.trackBotMessage(ctx.from!.id, sentMessage.message_id);
      },
      '📅 План дня': async () => {
        const dbKey: NotionDatabaseKey = 'dailyPlan';
        userStateService.setUserDatabase(ctx.from!.id, dbKey);
        const dbConfig = getDatabaseByKey(dbKey);
        const sentMessage = await ctx.reply(
          `✅ Выбрана база: *${dbConfig.title}*\n\nЧто добавить?`,
          { parse_mode: 'Markdown', ...keyboardService.getActionsKeyboard(dbKey) }
        );
        userStateService.trackBotMessage(ctx.from!.id, sentMessage.message_id);
      },
      '📝 Позже': async () => {
        // Показываем статусы для "Позже"
        await commandHandlers.handleLater(ctx);
      },
      '❓ Помощь': async () => {
        const helpText = 
          '📖 *Помощь*\n\n' +
          '• Используй кнопки меню для быстрого доступа к функциям\n' +
          '• Команда /start - начать заново\n' +
          '• Команда /menu - показать главное меню\n' +
          '• Команда /morning - утренняя рутина\n' +
          '• Команда /db - выбрать базу данных\n\n' +
          'Просто отправь текст, и он будет сохранен в выбранную базу!';
        const sentMessage = await ctx.reply(helpText, { parse_mode: 'Markdown' });
        userStateService.trackBotMessage(ctx.from!.id, sentMessage.message_id);
      },
    };

    if (buttonMap[text]) {
      await buttonMap[text]();
      return true;
    }

    return false;
  }
}

// Экспортируем singleton экземпляр
export const messageHandlers = new MessageHandlers();

