import { Context } from 'telegraf';
import { getDatabaseByKey, NotionDatabaseKey } from '../config/databases';
import { ensureTodayMorningRow, getMorningStatus, getMorningRoutineTasksDynamic, getPageNonCheckboxProperties, updateMorningTask, listTodayDailyPlan, ensureTodayDayRow, getDayStatus, getDayRoutineTasksDynamic, updateDayTask, getDayRoutineTasksByStatus, updateDayRoutineTaskStatus, getDayRoutineTaskInfo, getDayRoutineStatuses } from '../services/notion';
import { userStateService } from '../services/userState';
import { keyboardService } from '../keyboards';

/**
 * Обработчики действий (callback queries) бота.
 * Каждый обработчик отвечает за один тип действия.
 */
export class ActionHandlers {
  /**
   * Обработчик выбора базы данных.
   */
  async handleDatabaseSelection(ctx: Context, dbKey: NotionDatabaseKey): Promise<void> {
  const dbConfig = getDatabaseByKey(dbKey);

  if (!dbConfig) {
      await ctx.answerCbQuery('❌ База данных не найдена.');
      return;
  }

  // Установка базы пользователя (запоминание)
    userStateService.setUserDatabase(ctx.from!.id, dbKey);
  // Сброс режима в idle при переключении базы
    userStateService.setUserMode(ctx.from!.id, 'idle');

  await ctx.answerCbQuery(`Выбрана база: ${dbConfig.title}`);
  
    // Для утренней рутины сразу показываем чеклист
    if (dbKey === 'morningRoutine') {
      await this.showMorningRoutine(ctx, true);
    } else if (dbKey === 'dayRoutine') {
      // Для дневной рутины показываем статусы
      const { commandHandlers } = await import('./commands');
      await commandHandlers.handleDay(ctx);
    } else {
      // Для остальных баз показываем обычное меню действий
      const keyboard = keyboardService.getActionsKeyboard(dbKey);
      
      // При редактировании сообщения через callback query, исходное сообщение уже должно быть отслежено
      // Но если это новое сообщение, нужно его отследить
      if ('callback_query' in ctx.update && ctx.update.callback_query.message) {
        // Это редактирование существующего сообщения
        const originalMsgId = ctx.update.callback_query.message.message_id;
        const currentMessages = userStateService.getUserBotMessages(ctx.from!.id);
        if (!currentMessages.includes(originalMsgId)) {
          userStateService.trackBotMessage(ctx.from!.id, originalMsgId);
        }
      }
      
      const editedMsg = await ctx.editMessageText(
        `✅ База изменена: *${dbConfig.title}*`,
        { 
          parse_mode: 'Markdown',
          ...keyboard 
        }
      );
      // editMessageText редактирует существующее сообщение, ID остается тем же
      // Убеждаемся, что оно отслеживается
      if (editedMsg && typeof editedMsg === 'object' && 'message_id' in editedMsg) {
        const msgId = (editedMsg as any).message_id;
        if (msgId) {
          const currentMessages = userStateService.getUserBotMessages(ctx.from!.id);
          if (!currentMessages.includes(msgId)) {
            userStateService.trackBotMessage(ctx.from!.id, msgId);
          }
        }
      }
    }
  }

  /**
   * Обработчик действий создания/просмотра списка.
   */
  async handleAction(ctx: Context, type: 'create' | 'list', dbKey: NotionDatabaseKey): Promise<void> {
    const dbConfig = getDatabaseByKey(dbKey);
    
    if (!dbConfig) {
      await ctx.answerCbQuery('Ошибка: база не найдена');
      return;
    }

    if (type === 'create') {
      // Установка режима создания для пользователя
      userStateService.setUserMode(ctx.from!.id, 'create', dbKey);
      
      await ctx.answerCbQuery();
      const sentMessage = await ctx.reply(
        `✍️ Напиши текст задачи, я сохраню её в базу «${dbConfig.title}»:`
      );
      userStateService.trackBotMessage(ctx.from!.id, sentMessage.message_id);
    } else if (type === 'list') {
      if (dbKey === 'dailyPlan') {
        await ctx.answerCbQuery('Загружаю список...');
        const listText = await listTodayDailyPlan();
        const sentMessage = await ctx.reply(listText);
        userStateService.trackBotMessage(ctx.from!.id, sentMessage.message_id);
      } else if (dbKey === 'morningRoutine') {
        // Для утренней рутины показываем кнопки
        try {
          await this.showMorningRoutine(ctx, false);
          await ctx.answerCbQuery();
        } catch (error: any) {
          await ctx.answerCbQuery('Ошибка загрузки');
          const errorMsg = await ctx.reply(`❌ Ошибка: ${error.message}`);
          userStateService.trackBotMessage(ctx.from!.id, errorMsg.message_id);
        }
      } else if (dbKey === 'dayRoutine') {
        // Для дневной рутины показываем статусы
        try {
          const { commandHandlers } = await import('./commands');
          await commandHandlers.handleDay(ctx);
          await ctx.answerCbQuery();
        } catch (error: any) {
          await ctx.answerCbQuery('Ошибка загрузки');
          const errorMsg = await ctx.reply(`❌ Ошибка: ${error.message}`);
          userStateService.trackBotMessage(ctx.from!.id, errorMsg.message_id);
        }
      } else {
        await ctx.answerCbQuery('Функция доступна только для Дневного плана');
        const sentMessage = await ctx.reply(`📋 Просмотр списка для «${dbConfig.title}» пока не реализован.`);
        userStateService.trackBotMessage(ctx.from!.id, sentMessage.message_id);
      }
    }
  }

  /**
   * Обработчик нажатия на чекбокс утренней рутины.
   */
  async handleMorningTask(ctx: Context, propertyName: string): Promise<void> {
    try {
      // Отслеживаем исходное сообщение перед редактированием
      if ('callback_query' in ctx.update && ctx.update.callback_query.message) {
        const originalMsgId = ctx.update.callback_query.message.message_id;
        const currentMessages = userStateService.getUserBotMessages(ctx.from!.id);
        if (!currentMessages.includes(originalMsgId)) {
          userStateService.trackBotMessage(ctx.from!.id, originalMsgId);
        }
      }
      
      const pageId = await ensureTodayMorningRow();
      const tasks = await getMorningRoutineTasksDynamic();
      const currentStatus = await getMorningStatus(pageId, tasks);
      const newValue = !currentStatus[propertyName];
      
      await updateMorningTask(pageId, propertyName, newValue);
      
      // Обновляем клавиатуру и статистику
      const newStatus = { ...currentStatus, [propertyName]: newValue };
      const nonCheckboxProps = await getPageNonCheckboxProperties(pageId);
      const keyboard = await keyboardService.getMorningRoutineKeyboard(newStatus);
      
      let message = '🌅 *Утренняя рутина*\n\n';
      
      // Динамически выводим все не-чекбокс поля
      nonCheckboxProps.forEach(prop => {
        message += `${prop.name}: *${prop.value}*\n`;
      });
      
      if (nonCheckboxProps.length > 0) {
        message += '\n';
      }
      
      message += 'Что ты уже сделал сегодня?';
      
      const editedMsg = await ctx.editMessageText(message, { 
        parse_mode: 'Markdown',
        ...keyboard 
      });
      
      // editMessageText возвращает обновленное сообщение, ID остается тем же
      if (editedMsg && typeof editedMsg === 'object' && 'message_id' in editedMsg) {
        const msgId = (editedMsg as any).message_id;
        if (msgId) {
          const currentMessages = userStateService.getUserBotMessages(ctx.from!.id);
          if (!currentMessages.includes(msgId)) {
            userStateService.trackBotMessage(ctx.from!.id, msgId);
          }
        }
      }
      
      const label = tasks.find(t => t.propertyName === propertyName)?.label || propertyName;
      await ctx.answerCbQuery(newValue ? `✅ ${label} выполнено!` : `⬜ ${label} отменено`);
      
    } catch (error: any) {
      console.error('Error updating morning task:', error);
      await ctx.answerCbQuery(`❌ Ошибка: ${error.message}`);
    }
  }

  /**
   * Обработчик нажатия на чекбокс дневной рутины.
   */
  async handleDayTask(ctx: Context, propertyName: string): Promise<void> {
    try {
      // Отслеживаем исходное сообщение перед редактированием
      if ('callback_query' in ctx.update && ctx.update.callback_query.message) {
        const originalMsgId = ctx.update.callback_query.message.message_id;
        const currentMessages = userStateService.getUserBotMessages(ctx.from!.id);
        if (!currentMessages.includes(originalMsgId)) {
          userStateService.trackBotMessage(ctx.from!.id, originalMsgId);
        }
      }
      
      const pageId = await ensureTodayDayRow();
      const tasks = await getDayRoutineTasksDynamic();
      const currentStatus = await getDayStatus(pageId, tasks);
      const newValue = !currentStatus[propertyName];
      
      await updateDayTask(pageId, propertyName, newValue);
      
      // Обновляем клавиатуру и статистику
      const newStatus = { ...currentStatus, [propertyName]: newValue };
      const nonCheckboxProps = await getPageNonCheckboxProperties(pageId);
      const keyboard = await keyboardService.getDayRoutineKeyboard(newStatus);
      
      let message = '🕒 *Дневная рутина*\n\n';
      
      // Динамически выводим все не-чекбокс поля
      nonCheckboxProps.forEach(prop => {
        message += `${prop.name}: *${prop.value}*\n`;
      });
      
      if (nonCheckboxProps.length > 0) {
        message += '\n';
      }
      
      message += 'Что ты уже сделал сегодня?';
      
      const editedMsg = await ctx.editMessageText(message, { 
        parse_mode: 'Markdown',
        ...keyboard 
      });
      
      // editMessageText возвращает обновленное сообщение, ID остается тем же
      if (editedMsg && typeof editedMsg === 'object' && 'message_id' in editedMsg) {
        const msgId = (editedMsg as any).message_id;
        if (msgId) {
          const currentMessages = userStateService.getUserBotMessages(ctx.from!.id);
          if (!currentMessages.includes(msgId)) {
            userStateService.trackBotMessage(ctx.from!.id, msgId);
          }
        }
      }
      
      const label = tasks.find(t => t.propertyName === propertyName)?.label || propertyName;
      await ctx.answerCbQuery(newValue ? `✅ ${label} выполнено!` : `⬜ ${label} отменено`);
      
    } catch (error: any) {
      console.error('Error updating day task:', error);
      await ctx.answerCbQuery(`❌ Ошибка: ${error.message}`);
    }
  }

  /**
   * Обработчик выбора статуса дневной рутины.
   * Отправляет каждую задачу отдельным сообщением с кнопками управления.
   */
  async handleDayStatusSelection(ctx: Context, status: string): Promise<void> {
    try {
      await ctx.answerCbQuery('Загружаю задачи...');
      const tasks = await getDayRoutineTasksByStatus(status);
      
      if (tasks.length === 0) {
        const statusLower = status.toLowerCase();
        const isDoneStatus = statusLower.includes('готово') || statusLower.includes('done') || statusLower.includes('завершено') || statusLower.includes('completed');
        const message = `📋 Задач со статусом "${status}" не найдено${isDoneStatus ? ' (отредактированных сегодня)' : ''}.`;
        const sentMessage = await ctx.reply(message);
        userStateService.trackBotMessage(ctx.from!.id, sentMessage.message_id);
        return;
      }

      // Отправляем заголовок
      const headerMessage = await ctx.reply(`📋 *Задачи со статусом "${status}"* (${tasks.length}):`, { parse_mode: 'Markdown' });
      userStateService.trackBotMessage(ctx.from!.id, headerMessage.message_id);

      // Отправляем каждую задачу отдельным сообщением с кнопками
      for (const task of tasks) {
        const keyboard = await keyboardService.getDayRoutineTaskKeyboard(task);
        const taskMessage = `📌 *${task.title}*\n\nСтатус: ${task.status}`;
        const sentMessage = await ctx.reply(taskMessage, { 
          parse_mode: 'Markdown',
          ...keyboard 
        });
        userStateService.trackBotMessage(ctx.from!.id, sentMessage.message_id);
      }
    } catch (error: any) {
      console.error('Error fetching tasks by status:', error);
      await ctx.answerCbQuery('Ошибка загрузки');
      const errorMsg = await ctx.reply(`❌ Ошибка: ${error.message}`);
      userStateService.trackBotMessage(ctx.from!.id, errorMsg.message_id);
    }
  }

  /**
   * Обработчик изменения статуса задачи дневной рутины.
   */
  async handleDayTaskStatusChange(ctx: Context, shortId: string, newStatusShort: string): Promise<void> {
    try {
      // Получаем полный pageId по короткому ID
      const pageId = userStateService.getTaskPageId(shortId);
      if (!pageId) {
        await ctx.answerCbQuery('❌ Задача не найдена');
        return;
      }

      // Получаем полный статус из списка статусов
      const statuses = await getDayRoutineStatuses();
      const newStatus = statuses.find((s: string) => s.startsWith(newStatusShort)) || newStatusShort;

      await ctx.answerCbQuery('Обновляю статус...');
      await updateDayRoutineTaskStatus(pageId, newStatus);
      
      // Получаем обновленную информацию о задаче
      const task = await getDayRoutineTaskInfo(pageId);
      const keyboard = await keyboardService.getDayRoutineTaskKeyboard(task);
      
      const message = `📌 *${task.title}*\n\nСтатус: ${task.status}`;
      
      // Обновляем сообщение
      if ('callback_query' in ctx.update && ctx.update.callback_query.message) {
        const originalMsgId = ctx.update.callback_query.message.message_id;
        const currentMessages = userStateService.getUserBotMessages(ctx.from!.id);
        if (!currentMessages.includes(originalMsgId)) {
          userStateService.trackBotMessage(ctx.from!.id, originalMsgId);
        }
        
        await ctx.editMessageText(message, {
          parse_mode: 'Markdown',
          ...keyboard
        });
      }
      
      await ctx.answerCbQuery(`✅ Статус изменен на "${newStatus}"`);
    } catch (error: any) {
      console.error('Error updating task status:', error);
      await ctx.answerCbQuery('Ошибка обновления');
      const errorMsg = await ctx.reply(`❌ Ошибка: ${error.message}`);
      userStateService.trackBotMessage(ctx.from!.id, errorMsg.message_id);
    }
  }

  /**
   * Обработчик обновления задачи дневной рутины.
   */
  async handleDayTaskRefresh(ctx: Context, shortId: string): Promise<void> {
    try {
      // Получаем полный pageId по короткому ID
      const pageId = userStateService.getTaskPageId(shortId);
      if (!pageId) {
        await ctx.answerCbQuery('❌ Задача не найдена');
        return;
      }

      await ctx.answerCbQuery('Обновляю...');
      const task = await getDayRoutineTaskInfo(pageId);
      const keyboard = await keyboardService.getDayRoutineTaskKeyboard(task);
      
      const message = `📌 *${task.title}*\n\nСтатус: ${task.status}`;
      
      // Обновляем сообщение
      if ('callback_query' in ctx.update && ctx.update.callback_query.message) {
        const originalMsgId = ctx.update.callback_query.message.message_id;
        const currentMessages = userStateService.getUserBotMessages(ctx.from!.id);
        if (!currentMessages.includes(originalMsgId)) {
          userStateService.trackBotMessage(ctx.from!.id, originalMsgId);
        }
        
        await ctx.editMessageText(message, {
          parse_mode: 'Markdown',
          ...keyboard
        });
      }
      
      await ctx.answerCbQuery('✅ Обновлено');
    } catch (error: any) {
      console.error('Error refreshing task:', error);
      await ctx.answerCbQuery('Ошибка обновления');
      const errorMsg = await ctx.reply(`❌ Ошибка: ${error.message}`);
      userStateService.trackBotMessage(ctx.from!.id, errorMsg.message_id);
    }
  }

  /**
   * Обработчик удаления задачи дневной рутины.
   */
  async handleDayTaskDelete(ctx: Context, shortId: string): Promise<void> {
    try {
      // Получаем полный pageId по короткому ID
      const pageId = userStateService.getTaskPageId(shortId);
      if (!pageId) {
        await ctx.answerCbQuery('❌ Задача не найдена');
        return;
      }

      await ctx.answerCbQuery('Удаляю...');
      
      // В Notion API нет прямого метода удаления, но можно архивировать страницу
      const { Client } = await import('@notionhq/client');
      const notion = new Client({ auth: process.env.NOTION_API_KEY });
      
      await notion.pages.update({
        page_id: pageId,
        archived: true
      });

      // Удаляем регистрацию задачи
      userStateService.unregisterTaskId(shortId);
      
      // Удаляем сообщение с задачей
      if ('callback_query' in ctx.update && ctx.update.callback_query.message) {
        await ctx.deleteMessage();
      }
      
      await ctx.answerCbQuery('✅ Задача удалена');
    } catch (error: any) {
      console.error('Error deleting task:', error);
      await ctx.answerCbQuery('Ошибка удаления');
      const errorMsg = await ctx.reply(`❌ Ошибка: ${error.message}`);
      userStateService.trackBotMessage(ctx.from!.id, errorMsg.message_id);
    }
  }

  /**
   * Показывает чеклист утренней рутины.
   * Вспомогательный метод для переиспользования логики.
   */
  private async showMorningRoutine(ctx: Context, isEdit: boolean): Promise<void> {
    const pageId = await ensureTodayMorningRow();
    const tasks = await getMorningRoutineTasksDynamic();
    const status = await getMorningStatus(pageId, tasks);
    const nonCheckboxProps = await getPageNonCheckboxProperties(pageId);
    const keyboard = await keyboardService.getMorningRoutineKeyboard(status);
    
    let message = '🌅 *Утренняя рутина*\n\n';
    
    // Динамически выводим все не-чекбокс поля
    nonCheckboxProps.forEach(prop => {
      message += `${prop.name}: *${prop.value}*\n`;
    });
    
    if (nonCheckboxProps.length > 0) {
      message += '\n';
    }
    
    message += 'Что ты уже сделал сегодня?';
    
    // Если это callback query, редактируем сообщение, иначе отправляем новое
    if (isEdit && 'callback_query' in ctx.update) {
      // Отслеживаем исходное сообщение перед редактированием
      if (ctx.update.callback_query.message) {
        const originalMsgId = ctx.update.callback_query.message.message_id;
        const currentMessages = userStateService.getUserBotMessages(ctx.from!.id);
        if (!currentMessages.includes(originalMsgId)) {
          userStateService.trackBotMessage(ctx.from!.id, originalMsgId);
        }
      }
    
    const editedMsg = await ctx.editMessageText(message, { 
      parse_mode: 'Markdown',
      ...keyboard 
    });
    if (editedMsg && typeof editedMsg === 'object' && 'message_id' in editedMsg) {
      const msgId = (editedMsg as any).message_id;
      if (msgId) {
          const currentMessages = userStateService.getUserBotMessages(ctx.from!.id);
        if (!currentMessages.includes(msgId)) {
            userStateService.trackBotMessage(ctx.from!.id, msgId);
          }
        }
      }
    } else {
      const sentMessage = await ctx.reply(message, { parse_mode: 'Markdown', ...keyboard });
      userStateService.trackBotMessage(ctx.from!.id, sentMessage.message_id);
    }
  }

  /**
   * Показывает чеклист дневной рутины.
   * Вспомогательный метод для переиспользования логики.
   */
  private async showDayRoutine(ctx: Context, isEdit: boolean): Promise<void> {
    const pageId = await ensureTodayDayRow();
    const tasks = await getDayRoutineTasksDynamic();
    const status = await getDayStatus(pageId, tasks);
    const nonCheckboxProps = await getPageNonCheckboxProperties(pageId);
    const keyboard = await keyboardService.getDayRoutineKeyboard(status);
    
    let message = '🕒 *Дневная рутина*\n\n';
    
    // Динамически выводим все не-чекбокс поля
    nonCheckboxProps.forEach(prop => {
      message += `${prop.name}: *${prop.value}*\n`;
    });
    
    if (nonCheckboxProps.length > 0) {
      message += '\n';
    }
    
    message += 'Что ты уже сделал сегодня?';
    
    // Если это callback query, редактируем сообщение, иначе отправляем новое
    if (isEdit && 'callback_query' in ctx.update) {
      // Отслеживаем исходное сообщение перед редактированием
      if (ctx.update.callback_query.message) {
        const originalMsgId = ctx.update.callback_query.message.message_id;
        const currentMessages = userStateService.getUserBotMessages(ctx.from!.id);
        if (!currentMessages.includes(originalMsgId)) {
          userStateService.trackBotMessage(ctx.from!.id, originalMsgId);
        }
      }
      
      const editedMsg = await ctx.editMessageText(message, { 
        parse_mode: 'Markdown',
        ...keyboard 
      });
      if (editedMsg && typeof editedMsg === 'object' && 'message_id' in editedMsg) {
        const msgId = (editedMsg as any).message_id;
        if (msgId) {
          const currentMessages = userStateService.getUserBotMessages(ctx.from!.id);
          if (!currentMessages.includes(msgId)) {
            userStateService.trackBotMessage(ctx.from!.id, msgId);
          }
        }
      }
    } else {
      const sentMessage = await ctx.reply(message, { parse_mode: 'Markdown', ...keyboard });
      userStateService.trackBotMessage(ctx.from!.id, sentMessage.message_id);
    }
  }
}

// Экспортируем singleton экземпляр
export const actionHandlers = new ActionHandlers();

