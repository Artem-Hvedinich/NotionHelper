import { Context } from 'telegraf';
import { getDatabaseByKey, NotionDatabaseKey } from '../config/databases';
import { createPageInDatabase } from '../services/notion';
import { userStateService } from '../services/userState';
import { keyboardService } from '../keyboards';
import { commandHandlers } from './commands';

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
      
      await createPageInDatabase({ databaseKey: dbKey as any, text });

      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        response.message_id,
        undefined,
        `✅ Сохранил в базу «${dbConfig.title}».`,
        { parse_mode: 'Markdown' }
      );

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
      await createPageInDatabase({ databaseKey: dbKey as any, text });
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        response.message_id,
        undefined,
        `✅ Сохранил в базу «${dbConfig.title}».`,
        { parse_mode: 'Markdown' }
      );
    } catch (error: any) {
      console.error('Ошибка API Notion:', error);
      const errorMsg = await ctx.reply(`❌ Не удалось сохранить задачу. Попробуй позже.\nDebug: ${error.message || 'Unknown error'}`);
      userStateService.trackBotMessage(ctx.from!.id, errorMsg.message_id);
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
        const dbKey: NotionDatabaseKey = 'dayRoutine';
        userStateService.setUserDatabase(ctx.from!.id, dbKey);
        const dbConfig = getDatabaseByKey(dbKey);
        const sentMessage = await ctx.reply(
          `✅ Выбрана база: *${dbConfig.title}*\n\nЧто добавить?`,
          { parse_mode: 'Markdown', ...keyboardService.getActionsKeyboard(dbKey) }
        );
        userStateService.trackBotMessage(ctx.from!.id, sentMessage.message_id);
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

