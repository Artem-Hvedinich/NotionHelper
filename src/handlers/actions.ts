import { Context } from 'telegraf';
import { getDatabaseByKey, NotionDatabaseKey, DATABASES } from '../config/databases';
import { ensureTodayMorningRow, getMorningStatus, getMorningRoutineTasksDynamic, getPageNonCheckboxProperties, updateMorningTask, listTodayDailyPlan, ensureTodayDayRow, getDayStatus, getDayRoutineTasksDynamic, updateDayTask, getDayRoutineTasksByStatus, updateDayRoutineTaskStatus, getDayRoutineTaskInfo, getDayRoutineStatuses, getDayRoutineTaskCheckboxes, updateDayRoutineTaskCheckbox, getDatabaseCheckboxProperties, createPageInDatabase, getPageEditableProperties, updatePageProperty, getLaterTasksByStatus, getLaterTasksStatuses, getLaterTaskInfo, getLaterTaskCheckboxes, updateLaterTaskStatus, getDatabaseKeyByPageId, getDatabaseStatuses } from '../services/notion';
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
      await ctx.answerCbQuery('Загружаю...');
      await this.showMorningRoutine(ctx, true);
    } else if (dbKey === 'dayRoutine') {
      // Для дневной рутины показываем меню действий
      const keyboard = keyboardService.getActionsKeyboard(dbKey);
      
      // При редактировании сообщения через callback query, исходное сообщение уже должно быть отслежено
      if ('callback_query' in ctx.update && ctx.update.callback_query.message) {
        const originalMsgId = ctx.update.callback_query.message.message_id;
        const currentMessages = userStateService.getUserBotMessages(ctx.from!.id);
        if (!currentMessages.includes(originalMsgId)) {
          userStateService.trackBotMessage(ctx.from!.id, originalMsgId);
        }
      }
      
      const editedMsg = await ctx.editMessageText(
        `✅ База изменена: *${dbConfig.title}*\n\nЧто хочешь сделать?`,
        { 
          parse_mode: 'Markdown',
          ...keyboard 
        }
      );
      // editMessageText редактирует существующее сообщение, ID остается тем же
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
          await ctx.answerCbQuery('Загружаю...');
          await this.showMorningRoutine(ctx, false);
        } catch (error: any) {
          await ctx.answerCbQuery('Ошибка загрузки');
          const errorMsg = await ctx.reply(`❌ Ошибка: ${error.message}`);
          userStateService.trackBotMessage(ctx.from!.id, errorMsg.message_id);
        }
      } else if (dbKey === 'dayRoutine') {
        // Для дневной рутины показываем статусы
        try {
          await ctx.answerCbQuery('Загружаю...');
          const { commandHandlers } = await import('./commands');
          await commandHandlers.handleDay(ctx);
        } catch (error: any) {
          await ctx.answerCbQuery('Ошибка загрузки');
          const errorMsg = await ctx.reply(`❌ Ошибка: ${error.message}`);
          userStateService.trackBotMessage(ctx.from!.id, errorMsg.message_id);
        }
      } else if (dbKey === 'laterTasks') {
        // Для "Позже" показываем статусы
        try {
          await ctx.answerCbQuery('Загружаю...');
          const { commandHandlers } = await import('./commands');
          await commandHandlers.handleLater(ctx);
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
      await ctx.answerCbQuery('Обновляю...');
      
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
      await ctx.answerCbQuery('Обновляю...');
      
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
   * Показывает компактный список задач с возможностью открыть каждую.
   */
  async handleDayStatusSelection(ctx: Context, status: string): Promise<void> {
    try {
      await ctx.answerCbQuery('Загружаю задачи...');
      const tasks = await getDayRoutineTasksByStatus(status);
      
      if (tasks.length === 0) {
        const statusLower = status.toLowerCase();
        const isDoneStatus = statusLower.includes('готово') || statusLower.includes('done') || statusLower.includes('завершено') || statusLower.includes('completed');
        const message = `📋 Задач со статусом "${status}" не найдено${isDoneStatus ? ' (отредактированных сегодня)' : ''}.`;
        
        // Редактируем сообщение, если это callback query
        if ('callback_query' in ctx.update && ctx.update.callback_query.message) {
          await ctx.editMessageText(message);
        } else {
          const sentMessage = await ctx.reply(message);
          userStateService.trackBotMessage(ctx.from!.id, sentMessage.message_id);
        }
        return;
      }

      // Сохраняем статус для навигации назад
      userStateService.setUserTaskListStatus(ctx.from!.id, status);

      // Формируем компактный список задач
      // Используем простой текст без Markdown для списка, чтобы избежать проблем с экранированием
      const tasksList = tasks.map((task, index) => `${index + 1}. ${task.title}`).join('\n');
      const message = `📋 Задачи со статусом "${status}" (${tasks.length}):\n\n${tasksList}`;
      const keyboard = keyboardService.getDayRoutineTasksListKeyboard(tasks);

      // Редактируем сообщение, если это callback query, иначе отправляем новое
      if ('callback_query' in ctx.update && ctx.update.callback_query.message) {
        const originalMsgId = ctx.update.callback_query.message.message_id;
        const currentMessages = userStateService.getUserBotMessages(ctx.from!.id);
        if (!currentMessages.includes(originalMsgId)) {
          userStateService.trackBotMessage(ctx.from!.id, originalMsgId);
        }
        
        await ctx.editMessageText(message, {
          ...keyboard
        });
      } else {
        const sentMessage = await ctx.reply(message, {
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
   * Обработчик открытия задачи после создания.
   * Отправляет новое сообщение с задачей.
   */
  async handleDayTaskOpenAfterCreate(ctx: Context, shortId: string): Promise<void> {
    let loadingMsg: any = null;
    try {
      // Получаем полный pageId по короткому ID
      const pageId = userStateService.getTaskPageId(shortId);
      if (!pageId) {
        await ctx.reply('❌ Задача не найдена');
        return;
      }

      // Показываем индикатор загрузки
      loadingMsg = await ctx.reply('⏳ Загружаю задачу...');
      userStateService.trackBotMessage(ctx.from!.id, loadingMsg.message_id);

      // Явно указываем базу данных, так как сразу после создания автоматическое определение может не сработать
      const dbKey: NotionDatabaseKey = 'dayRoutine';
      const task = await getDayRoutineTaskInfo(pageId, dbKey);
      const checkboxes = await getDayRoutineTaskCheckboxes(pageId, dbKey);
      const editableProperties = await getPageEditableProperties(pageId);
      const keyboard = await keyboardService.getDayRoutineTaskKeyboard(task, checkboxes, editableProperties);
      
      // Формируем сообщение с информацией о задаче
      let message = `✅ Задача создана!\n\n📌 ${task.title}\n\nСтатус: ${task.status}`;
      
      // Добавляем информацию о других полях (кроме статуса, title и чекбоксов)
      if (editableProperties && editableProperties.length > 0) {
        const statusPropertyName = await this.findStatusPropertyName(pageId);
        const otherProps = editableProperties.filter(p => 
          p.type !== 'checkbox' && 
          p.type !== 'title' && 
          p.name !== statusPropertyName && 
          p.value
        );
        if (otherProps.length > 0) {
          message += '\n\n';
          otherProps.forEach(prop => {
            const valueDisplay = prop.value.length > 50 ? prop.value.substring(0, 47) + '...' : prop.value;
            message += `${prop.name}: ${valueDisplay}\n`;
          });
        }
      }
      
      // Удаляем сообщение "Загружаю..." и отправляем новое сообщение
      try {
        await ctx.telegram.deleteMessage(ctx.chat!.id, loadingMsg.message_id);
      } catch (error: any) {
        // Игнорируем ошибки удаления
      }
      
      const sentMessage = await ctx.reply(message, {
        ...keyboard
      });
      userStateService.trackBotMessage(ctx.from!.id, sentMessage.message_id);
    } catch (error: any) {
      console.error('Error opening task after create:', error);
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
   * Обработчик открытия задачи из списка.
   */
  async handleDayTaskOpen(ctx: Context, shortId: string): Promise<void> {
    try {
      // Получаем полный pageId по короткому ID
      const pageId = userStateService.getTaskPageId(shortId);
      if (!pageId) {
        await ctx.answerCbQuery('❌ Задача не найдена');
        return;
      }

      await ctx.answerCbQuery('Загружаю задачу...');
      
      // Получаем информацию о задаче
      const task = await getDayRoutineTaskInfo(pageId);
      const checkboxes = await getDayRoutineTaskCheckboxes(pageId);
      const editableProperties = await getPageEditableProperties(pageId);
      const keyboard = await keyboardService.getDayRoutineTaskKeyboard(task, checkboxes, editableProperties);
      
      // Формируем сообщение с информацией о задаче
      let message = `📌 ${task.title}\n\nСтатус: ${task.status}`;
      
      // Добавляем информацию о других полях (кроме статуса, title и чекбоксов)
      if (editableProperties && editableProperties.length > 0) {
        const statusPropertyName = await this.findStatusPropertyName(pageId);
        const otherProps = editableProperties.filter(p => 
          p.type !== 'checkbox' && 
          p.type !== 'title' && 
          p.name !== statusPropertyName && 
          p.value
        );
        if (otherProps.length > 0) {
          message += '\n\n';
          otherProps.forEach(prop => {
            const valueDisplay = prop.value.length > 50 ? prop.value.substring(0, 47) + '...' : prop.value;
            message += `${prop.name}: ${valueDisplay}\n`;
          });
        }
      }
      
      // Редактируем сообщение
      if ('callback_query' in ctx.update && ctx.update.callback_query.message) {
        const originalMsgId = ctx.update.callback_query.message.message_id;
        const currentMessages = userStateService.getUserBotMessages(ctx.from!.id);
        if (!currentMessages.includes(originalMsgId)) {
          userStateService.trackBotMessage(ctx.from!.id, originalMsgId);
        }
        
        await ctx.editMessageText(message, {
          ...keyboard
        });
      }
      } catch (error: any) {
      console.error('Error opening task:', error);
        await ctx.answerCbQuery('Ошибка загрузки');
        const errorMsg = await ctx.reply(`❌ Ошибка: ${error.message}`);
      userStateService.trackBotMessage(ctx.from!.id, errorMsg.message_id);
    }
  }

  /**
   * Обработчик возврата к списку задач.
   */
  async handleDayBackToList(ctx: Context, shortId: string): Promise<void> {
    try {
      // Получаем сохраненный статус
      const status = userStateService.getUserTaskListStatus(ctx.from!.id);
      if (!status) {
        // Если статус не найден, возвращаемся к списку статусов
        await ctx.answerCbQuery('Возвращаюсь к статусам...');
        await this.handleDayBackToStatuses(ctx);
        return;
      }

      // Возвращаемся к списку задач
      await this.handleDayStatusSelection(ctx, status);
    } catch (error: any) {
      console.error('Error going back to list:', error);
      await ctx.answerCbQuery('Ошибка');
    }
  }

  /**
   * Обработчик возврата к списку статусов.
   */
  async handleDayBackToStatuses(ctx: Context): Promise<void> {
    try {
      await ctx.answerCbQuery('Возвращаюсь...');
      
      // Удаляем сообщение со списком задач
      if ('callback_query' in ctx.update && ctx.update.callback_query.message) {
        try {
          await ctx.deleteMessage();
        } catch (error: any) {
          // Игнорируем ошибки удаления (сообщение может быть уже удалено)
          console.log('Could not delete message:', error.message);
        }
      }
      
      // Показываем список статусов
      const { commandHandlers } = await import('./commands');
      await commandHandlers.handleDay(ctx);
    } catch (error: any) {
      console.error('Error going back to statuses:', error);
      await ctx.answerCbQuery('Ошибка');
    }
  }

  /**
   * Обработчик добавления задачи в дневную рутину.
   */
  async handleDayAddTask(ctx: Context): Promise<void> {
    try {
      const dbKey: NotionDatabaseKey = 'dayRoutine';
      const dbConfig = getDatabaseByKey(dbKey);
      
      // Установка режима создания для пользователя
      userStateService.setUserDatabase(ctx.from!.id, dbKey);
      userStateService.setUserMode(ctx.from!.id, 'create', dbKey);
      
      await ctx.answerCbQuery();
      
      // Редактируем сообщение или отправляем новое
      if ('callback_query' in ctx.update && ctx.update.callback_query.message) {
        const originalMsgId = ctx.update.callback_query.message.message_id;
        const currentMessages = userStateService.getUserBotMessages(ctx.from!.id);
        if (!currentMessages.includes(originalMsgId)) {
          userStateService.trackBotMessage(ctx.from!.id, originalMsgId);
      }
        
        await ctx.editMessageText(
          `✍️ Напиши текст задачи, я сохраню её в базу «${dbConfig.title}»:`
        );
    } else {
        const sentMessage = await ctx.reply(
          `✍️ Напиши текст задачи, я сохраню её в базу «${dbConfig.title}»:`
        );
        userStateService.trackBotMessage(ctx.from!.id, sentMessage.message_id);
      }
    } catch (error: any) {
      console.error('Error handling day add task:', error);
      await ctx.answerCbQuery('Ошибка');
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

      // Определяем базу данных по pageId и получаем правильные статусы
      const dbKey = await getDatabaseKeyByPageId(pageId) || 'dayRoutine';
      const statuses = await getDatabaseStatuses(dbKey);
      const newStatus = statuses.find((s: string) => s.startsWith(newStatusShort)) || newStatusShort;

      await ctx.answerCbQuery('Обновляю статус...');
      await updateDayRoutineTaskStatus(pageId, newStatus);
      
      // Обновляем задачу
      await this.refreshDayTask(ctx, shortId);
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
      const checkboxes = await getDayRoutineTaskCheckboxes(pageId);
      const keyboard = await keyboardService.getDayRoutineTaskKeyboard(task, checkboxes);
      
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
      
      // Возвращаемся к начальному меню (списку статусов)
      await this.handleDayBackToStatuses(ctx);
    } catch (error: any) {
      console.error('Error deleting task:', error);
      await ctx.answerCbQuery('Ошибка удаления');
      const errorMsg = await ctx.reply(`❌ Ошибка: ${error.message}`);
      userStateService.trackBotMessage(ctx.from!.id, errorMsg.message_id);
    }
  }

  /**
   * Обработчик переключения чекбокса задачи дневной рутины.
 */
  async handleDayTaskCheckboxToggle(ctx: Context, shortId: string, propertyNameShort: string): Promise<void> {
    try {
      // Получаем полный pageId по короткому ID
      const pageId = userStateService.getTaskPageId(shortId);
      if (!pageId) {
        await ctx.answerCbQuery('❌ Задача не найдена');
        return;
      }

      // Получаем чекбоксы, которые действительно существуют на странице
      const checkboxes = await getDayRoutineTaskCheckboxes(pageId);
      const checkbox = checkboxes.find(cb => cb.propertyName.startsWith(propertyNameShort));
      
      if (!checkbox) {
        await ctx.answerCbQuery('❌ Чекбокс не найден на этой странице');
        return;
      }

      const newValue = !checkbox.checked;

      await ctx.answerCbQuery('Обновляю...');
      
      try {
        await updateDayRoutineTaskCheckbox(pageId, checkbox.propertyName, newValue);
      } catch (error: any) {
        // Если поле не существует на странице, показываем понятное сообщение
        if (error.message && error.message.includes('is not a property that exists')) {
          await ctx.answerCbQuery('❌ Это поле не доступно для этой задачи');
          return;
        }
        throw error;
      }
      
      // Получаем обновленную информацию о задаче
      const task = await getDayRoutineTaskInfo(pageId);
      const updatedCheckboxes = await getDayRoutineTaskCheckboxes(pageId);
      const keyboard = await keyboardService.getDayRoutineTaskKeyboard(task, updatedCheckboxes);
      
      // Используем простой текст без Markdown
      const message = `📌 ${task.title}\n\nСтатус: ${task.status}`;
      
      // Обновляем сообщение
      if ('callback_query' in ctx.update && ctx.update.callback_query.message) {
        const originalMsgId = ctx.update.callback_query.message.message_id;
        const currentMessages = userStateService.getUserBotMessages(ctx.from!.id);
        if (!currentMessages.includes(originalMsgId)) {
          userStateService.trackBotMessage(ctx.from!.id, originalMsgId);
        }
        
        await ctx.editMessageText(message, {
          ...keyboard
        });
      }
      
      await ctx.answerCbQuery(newValue ? `✅ ${checkbox.label} отмечено` : `⬜ ${checkbox.label} снято`);
    } catch (error: any) {
      console.error('Error toggling checkbox:', error);
      await ctx.answerCbQuery('Ошибка обновления');
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

  /**
   * Вспомогательная функция для поиска названия поля статуса.
   */
  private async findStatusPropertyName(pageId: string): Promise<string | null> {
    try {
      const { DATABASES } = await import('../config/databases');
      const dbConfig = DATABASES.dayRoutine;
      // Используем прямой вызов функции из notion.ts
      const notionModule = await import('../services/notion');
      // findStatusProperty не экспортируется, используем другой подход
      // Получаем схему базы данных напрямую
      const { Client } = await import('@notionhq/client');
      const notion = new Client({ auth: process.env.NOTION_API_KEY });
      const response = await notion.databases.retrieve({ database_id: dbConfig.id });
      
      for (const [propName, prop] of Object.entries(response.properties)) {
        // @ts-ignore
        if (prop.type === 'select' || prop.type === 'status') {
          const nameLower = propName.toLowerCase();
          if (nameLower.includes('статус') || nameLower.includes('status') || propName.includes('🔄') || propName.includes('⌚')) {
            return propName;
          }
        }
      }
      
      // Если не нашли по названию, возвращаем первое поле типа select или status
      for (const [propName, prop] of Object.entries(response.properties)) {
        // @ts-ignore
        if (prop.type === 'select' || prop.type === 'status') {
          return propName;
        }
      }
      
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Обработчик начала редактирования поля задачи.
   */
  async handleDayTaskEditProperty(ctx: Context, shortId: string, propertyNameShort: string, propertyTypeShort: string): Promise<void> {
    try {
      const pageId = userStateService.getTaskPageId(shortId);
      if (!pageId) {
        await ctx.answerCbQuery('❌ Задача не найдена');
        return;
      }

      await ctx.answerCbQuery('Загружаю...');
      
      // Получаем полные названия свойств
      const editableProperties = await getPageEditableProperties(pageId);
      const property = editableProperties.find(p => p.name.startsWith(propertyNameShort));
      
      if (!property) {
        await ctx.answerCbQuery('❌ Поле не найдено');
        return;
      }

      // Если это select или status, показываем кнопки выбора
      if (property.type === 'select' || property.type === 'status') {
        if (property.options && property.options.length > 0) {
          const keyboard = keyboardService.getPropertyOptionsKeyboard(shortId, property.name, property.type, property.options, property.value);
          const message = `Выбери новое значение для поля "${property.name}":\n\nТекущее: ${property.value || 'не установлено'}`;
          
          await ctx.answerCbQuery();
          if ('callback_query' in ctx.update && ctx.update.callback_query.message) {
            await ctx.editMessageText(message, keyboard);
          } else {
            const sentMessage = await ctx.reply(message, keyboard);
            userStateService.trackBotMessage(ctx.from!.id, sentMessage.message_id);
          }
        } else {
          await ctx.answerCbQuery('❌ Нет доступных опций');
        }
      } else if (property.type === 'checkbox') {
        // Для чекбокса просто переключаем значение
        const newValue = property.value !== 'true';
        await ctx.answerCbQuery('Обновляю...');
        await updatePageProperty(pageId, property.name, property.type, newValue);
        
        // Обновляем задачу
        await this.refreshDayTask(ctx, shortId);
        await ctx.answerCbQuery(newValue ? `✅ ${property.name} отмечено` : `⬜ ${property.name} снято`);
      } else {
        // Для остальных типов полей устанавливаем режим редактирования
        userStateService.setUserEditMode(ctx.from!.id, shortId, property.name, property.type);
        
        let promptMessage = `✍️ Введи новое значение для поля "${property.name}":\n\n`;
        promptMessage += `Текущее: ${property.value || 'не установлено'}\n\n`;
        
        if (property.type === 'number') {
          promptMessage += 'Введи число:';
        } else if (property.type === 'date') {
          promptMessage += 'Введи дату в формате YYYY-MM-DD:';
        } else if (property.type === 'url') {
          promptMessage += 'Введи URL:';
        } else if (property.type === 'email') {
          promptMessage += 'Введи email:';
        } else if (property.type === 'phone_number') {
          promptMessage += 'Введи номер телефона:';
        } else {
          promptMessage += 'Введи текст:';
        }
        
        await ctx.answerCbQuery();
        const sentMessage = await ctx.reply(promptMessage);
        userStateService.trackBotMessage(ctx.from!.id, sentMessage.message_id);
      }
    } catch (error: any) {
      console.error('Error editing property:', error);
      await ctx.answerCbQuery('Ошибка');
      const errorMsg = await ctx.reply(`❌ Ошибка: ${error.message}`);
      userStateService.trackBotMessage(ctx.from!.id, errorMsg.message_id);
    }
  }

  /**
   * Обработчик выбора значения для select/status поля.
   */
  async handleDayTaskPropertyOption(ctx: Context, shortId: string, propertyNameShort: string, propertyTypeShort: string, optionShort: string): Promise<void> {
    try {
      const pageId = userStateService.getTaskPageId(shortId);
      if (!pageId) {
        await ctx.answerCbQuery('❌ Задача не найдена');
        return;
      }

      await ctx.answerCbQuery('Загружаю...');
      
      // Получаем полные названия свойств
      const editableProperties = await getPageEditableProperties(pageId);
      const property = editableProperties.find(p => p.name.startsWith(propertyNameShort));
      
      if (!property || !property.options) {
        await ctx.answerCbQuery('❌ Поле не найдено');
        return;
      }

      // Находим полное название опции
      const option = property.options.find(opt => opt.startsWith(optionShort));
      if (!option) {
        await ctx.answerCbQuery('❌ Опция не найдена');
        return;
      }

      await ctx.answerCbQuery('Обновляю...');
      await updatePageProperty(pageId, property.name, property.type, option);
      
      // Обновляем задачу
      await this.refreshDayTask(ctx, shortId);
      await ctx.answerCbQuery(`✅ ${property.name} изменено на "${option}"`);
    } catch (error: any) {
      console.error('Error updating property option:', error);
      await ctx.answerCbQuery('Ошибка обновления');
      const errorMsg = await ctx.reply(`❌ Ошибка: ${error.message}`);
      userStateService.trackBotMessage(ctx.from!.id, errorMsg.message_id);
    }
  }

  /**
   * Обработчик отмены редактирования поля.
   */
  async handleDayTaskCancelEdit(ctx: Context, shortId: string): Promise<void> {
    userStateService.clearUserEditMode(ctx.from!.id);
    await ctx.answerCbQuery('❌ Отменено');
    await this.refreshDayTask(ctx, shortId);
  }

  /**
   * Вспомогательная функция для обновления отображения задачи.
   */
  async refreshDayTask(ctx: Context, shortId: string): Promise<void> {
    try {
      const pageId = userStateService.getTaskPageId(shortId);
      if (!pageId) {
        return;
      }

      // Определяем базу данных автоматически
      const dbKey = await getDatabaseKeyByPageId(pageId) || 'dayRoutine';
      const task = await getDayRoutineTaskInfo(pageId, dbKey);
      const checkboxes = await getDayRoutineTaskCheckboxes(pageId, dbKey);
      const editableProperties = await getPageEditableProperties(pageId);
      const keyboard = await keyboardService.getDayRoutineTaskKeyboard(task, checkboxes, editableProperties);
      
      let message = `📌 ${task.title}\n\nСтатус: ${task.status}`;
      
      if (editableProperties && editableProperties.length > 0) {
        const statusPropertyName = await this.findStatusPropertyName(pageId);
        const otherProps = editableProperties.filter(p => 
          p.type !== 'checkbox' && 
          p.type !== 'title' && 
          p.name !== statusPropertyName && 
          p.value
        );
        if (otherProps.length > 0) {
          message += '\n\n';
          otherProps.forEach(prop => {
            const valueDisplay = prop.value.length > 50 ? prop.value.substring(0, 47) + '...' : prop.value;
            message += `${prop.name}: ${valueDisplay}\n`;
          });
        }
      }

      // Если это callback query, редактируем сообщение
      if ('callback_query' in ctx.update && ctx.update.callback_query.message) {
        const originalMsgId = ctx.update.callback_query.message.message_id;
        const currentMessages = userStateService.getUserBotMessages(ctx.from!.id);
        if (!currentMessages.includes(originalMsgId)) {
          userStateService.trackBotMessage(ctx.from!.id, originalMsgId);
        }
        
        await ctx.editMessageText(message, keyboard);
      } else {
        // Если это текстовое сообщение, отправляем новое
        const sentMessage = await ctx.reply(message, keyboard);
        userStateService.trackBotMessage(ctx.from!.id, sentMessage.message_id);
      }
    } catch (error: any) {
      console.error('Error refreshing task:', error);
    }
  }

  /**
   * Вспомогательная функция для обновления отображения задачи "Позже".
   */
  async refreshLaterTask(ctx: Context, shortId: string): Promise<void> {
    try {
      const pageId = userStateService.getTaskPageId(shortId);
      if (!pageId) {
        return;
      }

      // Определяем базу данных автоматически
      const dbKey = await getDatabaseKeyByPageId(pageId) || 'laterTasks';
      const task = await getLaterTaskInfo(pageId, dbKey);
      const checkboxes = await getLaterTaskCheckboxes(pageId, dbKey);
      const editableProperties = await getPageEditableProperties(pageId);
      const keyboard = await keyboardService.getLaterTaskKeyboard(task, checkboxes, editableProperties);
      
      let message = `📌 ${task.title}\n\nСтатус: ${task.status}`;
      
      if (editableProperties && editableProperties.length > 0) {
        const statusPropertyName = await this.findStatusPropertyName(pageId);
        const otherProps = editableProperties.filter(p => 
          p.type !== 'checkbox' && 
          p.type !== 'title' && 
          p.name !== statusPropertyName && 
          p.value
        );
        if (otherProps.length > 0) {
          message += '\n\n';
          otherProps.forEach(prop => {
            const valueDisplay = prop.value.length > 50 ? prop.value.substring(0, 47) + '...' : prop.value;
            message += `${prop.name}: ${valueDisplay}\n`;
          });
        }
      }

      // Если это callback query, редактируем сообщение
      if ('callback_query' in ctx.update && ctx.update.callback_query.message) {
        const originalMsgId = ctx.update.callback_query.message.message_id;
        const currentMessages = userStateService.getUserBotMessages(ctx.from!.id);
        if (!currentMessages.includes(originalMsgId)) {
          userStateService.trackBotMessage(ctx.from!.id, originalMsgId);
        }
        
        await ctx.editMessageText(message, keyboard);
      } else {
        // Если это текстовое сообщение, отправляем новое
        const sentMessage = await ctx.reply(message, keyboard);
        userStateService.trackBotMessage(ctx.from!.id, sentMessage.message_id);
      }
    } catch (error: any) {
      console.error('Error refreshing later task:', error);
    }
  }

  /**
   * Обработчики для "Позже" - аналогичны обработчикам дневной рутины
   */

  /**
   * Обработчик выбора статуса "Позже".
   */
  async handleLaterStatusSelection(ctx: Context, status: string): Promise<void> {
    try {
      await ctx.answerCbQuery('Загружаю задачи...');
      const tasks = await getLaterTasksByStatus(status);
      
      if (tasks.length === 0) {
        const statusLower = status.toLowerCase();
        const isDoneStatus = statusLower.includes('готово') || statusLower.includes('done') || statusLower.includes('завершено') || statusLower.includes('completed');
        const message = `📋 Задач со статусом "${status}" не найдено${isDoneStatus ? ' (отредактированных сегодня)' : ''}.`;
        
        if ('callback_query' in ctx.update && ctx.update.callback_query.message) {
          await ctx.editMessageText(message);
        } else {
          const sentMessage = await ctx.reply(message);
          userStateService.trackBotMessage(ctx.from!.id, sentMessage.message_id);
        }
        return;
      }

      userStateService.setUserTaskListStatus(ctx.from!.id, status);

      const tasksList = tasks.map((task, index) => `${index + 1}. ${task.title}`).join('\n');
      const message = `📋 Задачи со статусом "${status}" (${tasks.length}):\n\n${tasksList}`;
      const keyboard = keyboardService.getLaterTasksListKeyboard(tasks);

      if ('callback_query' in ctx.update && ctx.update.callback_query.message) {
        const originalMsgId = ctx.update.callback_query.message.message_id;
        const currentMessages = userStateService.getUserBotMessages(ctx.from!.id);
        if (!currentMessages.includes(originalMsgId)) {
          userStateService.trackBotMessage(ctx.from!.id, originalMsgId);
        }
        
        await ctx.editMessageText(message, {
          ...keyboard
        });
      } else {
        const sentMessage = await ctx.reply(message, {
          ...keyboard
        });
        userStateService.trackBotMessage(ctx.from!.id, sentMessage.message_id);
      }
    } catch (error: any) {
      console.error('Error fetching later tasks by status:', error);
      await ctx.answerCbQuery('Ошибка загрузки');
      const errorMsg = await ctx.reply(`❌ Ошибка: ${error.message}`);
      userStateService.trackBotMessage(ctx.from!.id, errorMsg.message_id);
    }
  }

  /**
   * Обработчик открытия задачи "Позже" после создания.
   */
  async handleLaterTaskOpenAfterCreate(ctx: Context, shortId: string): Promise<void> {
    let loadingMsg: any = null;
    try {
      const pageId = userStateService.getTaskPageId(shortId);
      if (!pageId) {
        await ctx.reply('❌ Задача не найдена');
        return;
      }

      // Показываем индикатор загрузки
      loadingMsg = await ctx.reply('⏳ Загружаю задачу...');
      userStateService.trackBotMessage(ctx.from!.id, loadingMsg.message_id);

      // Явно указываем базу данных, так как сразу после создания автоматическое определение может не сработать
      const dbKey: NotionDatabaseKey = 'laterTasks';
      const task = await getLaterTaskInfo(pageId, dbKey);
      const checkboxes = await getLaterTaskCheckboxes(pageId, dbKey);
      const editableProperties = await getPageEditableProperties(pageId);
      const keyboard = await keyboardService.getLaterTaskKeyboard(task, checkboxes, editableProperties);
      
      let message = `✅ Задача создана!\n\n📌 ${task.title}\n\nСтатус: ${task.status}`;
      
      if (editableProperties && editableProperties.length > 0) {
        const statusPropertyName = await this.findStatusPropertyName(pageId);
        const otherProps = editableProperties.filter(p => 
          p.type !== 'checkbox' && 
          p.type !== 'title' && 
          p.name !== statusPropertyName && 
          p.value
        );
        if (otherProps.length > 0) {
          message += '\n\n';
          otherProps.forEach(prop => {
            const valueDisplay = prop.value.length > 50 ? prop.value.substring(0, 47) + '...' : prop.value;
            message += `${prop.name}: ${valueDisplay}\n`;
          });
        }
      }
      
      // Удаляем сообщение "Загружаю..." и отправляем новое сообщение
      try {
        if (loadingMsg) {
          await ctx.telegram.deleteMessage(ctx.chat!.id, loadingMsg.message_id);
        }
      } catch (deleteError: any) {
        // Игнорируем ошибки удаления
      }
      
      const sentMessage = await ctx.reply(message, {
        ...keyboard
      });
      userStateService.trackBotMessage(ctx.from!.id, sentMessage.message_id);
    } catch (error: any) {
      console.error('Error opening later task after create:', error);
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
   * Обработчик открытия задачи "Позже" из списка.
   */
  async handleLaterTaskOpen(ctx: Context, shortId: string): Promise<void> {
    try {
      const pageId = userStateService.getTaskPageId(shortId);
      if (!pageId) {
        await ctx.answerCbQuery('❌ Задача не найдена');
        return;
      }

      await ctx.answerCbQuery('Загружаю задачу...');
      
      const task = await getLaterTaskInfo(pageId);
      const checkboxes = await getLaterTaskCheckboxes(pageId);
      const editableProperties = await getPageEditableProperties(pageId);
      const keyboard = await keyboardService.getLaterTaskKeyboard(task, checkboxes, editableProperties);
      
      let message = `📌 ${task.title}\n\nСтатус: ${task.status}`;
      
      if (editableProperties && editableProperties.length > 0) {
        const statusPropertyName = await this.findStatusPropertyName(pageId);
        const otherProps = editableProperties.filter(p => 
          p.type !== 'checkbox' && 
          p.type !== 'title' && 
          p.name !== statusPropertyName && 
          p.value
        );
        if (otherProps.length > 0) {
          message += '\n\n';
          otherProps.forEach(prop => {
            const valueDisplay = prop.value.length > 50 ? prop.value.substring(0, 47) + '...' : prop.value;
            message += `${prop.name}: ${valueDisplay}\n`;
          });
        }
      }
      
      if ('callback_query' in ctx.update && ctx.update.callback_query.message) {
        const originalMsgId = ctx.update.callback_query.message.message_id;
        const currentMessages = userStateService.getUserBotMessages(ctx.from!.id);
        if (!currentMessages.includes(originalMsgId)) {
          userStateService.trackBotMessage(ctx.from!.id, originalMsgId);
        }
        
        await ctx.editMessageText(message, {
          ...keyboard
        });
      }
    } catch (error: any) {
      console.error('Error opening later task:', error);
      await ctx.answerCbQuery('Ошибка загрузки');
      const errorMsg = await ctx.reply(`❌ Ошибка: ${error.message}`);
      userStateService.trackBotMessage(ctx.from!.id, errorMsg.message_id);
    }
  }

  /**
   * Обработчик добавления задачи в "Позже".
   */
  async handleLaterAddTask(ctx: Context): Promise<void> {
    try {
      const dbKey: NotionDatabaseKey = 'laterTasks';
      const dbConfig = getDatabaseByKey(dbKey);
      
      userStateService.setUserDatabase(ctx.from!.id, dbKey);
      userStateService.setUserMode(ctx.from!.id, 'create', dbKey);
      
      await ctx.answerCbQuery();
      
      if ('callback_query' in ctx.update && ctx.update.callback_query.message) {
        const originalMsgId = ctx.update.callback_query.message.message_id;
        const currentMessages = userStateService.getUserBotMessages(ctx.from!.id);
        if (!currentMessages.includes(originalMsgId)) {
          userStateService.trackBotMessage(ctx.from!.id, originalMsgId);
        }
        
        await ctx.editMessageText(
          `✍️ Напиши текст новой задачи, я сохраню её в базу «${dbConfig.title}»:`
        );
      } else {
        const sentMessage = await ctx.reply(
          `✍️ Напиши текст новой задачи, я сохраню её в базу «${dbConfig.title}»:`
        );
        userStateService.trackBotMessage(ctx.from!.id, sentMessage.message_id);
      }
    } catch (error: any) {
      console.error('Error handling later add task:', error);
      await ctx.answerCbQuery('Ошибка');
      const errorMsg = await ctx.reply(`❌ Ошибка: ${error.message}`);
      userStateService.trackBotMessage(ctx.from!.id, errorMsg.message_id);
    }
  }

  /**
   * Обработчик возврата к списку задач "Позже".
   */
  async handleLaterBackToList(ctx: Context, shortId: string): Promise<void> {
    try {
      const status = userStateService.getUserTaskListStatus(ctx.from!.id);
      if (!status) {
        // Если статус не найден, возвращаемся к списку статусов
        await ctx.answerCbQuery('Возвращаюсь к статусам...');
        await this.handleLaterBackToStatuses(ctx);
        return;
      }

      await this.handleLaterStatusSelection(ctx, status);
    } catch (error: any) {
      console.error('Error going back to later list:', error);
      await ctx.answerCbQuery('Ошибка');
    }
  }

  /**
   * Обработчик возврата к статусам "Позже".
   */
  async handleLaterBackToStatuses(ctx: Context): Promise<void> {
    try {
      await ctx.answerCbQuery('Возвращаюсь...');
      
      if ('callback_query' in ctx.update && ctx.update.callback_query.message) {
        try {
          await ctx.deleteMessage();
        } catch (error: any) {
          console.log('Could not delete message:', error.message);
        }
      }
      
      const { commandHandlers } = await import('./commands');
      await commandHandlers.handleLater(ctx);
    } catch (error: any) {
      console.error('Error going back to later statuses:', error);
      await ctx.answerCbQuery('Ошибка');
    }
  }

  /**
   * Обработчик изменения статуса задачи "Позже".
   */
  async handleLaterTaskStatusChange(ctx: Context, shortId: string, newStatusShort: string): Promise<void> {
    try {
      const pageId = userStateService.getTaskPageId(shortId);
      if (!pageId) {
        await ctx.answerCbQuery('❌ Задача не найдена');
        return;
      }

      // Определяем базу данных по pageId и получаем правильные статусы
      const dbKey = await getDatabaseKeyByPageId(pageId) || 'laterTasks';
      const statuses = await getDatabaseStatuses(dbKey);
      const newStatus = statuses.find((s: string) => s.startsWith(newStatusShort)) || newStatusShort;

      await ctx.answerCbQuery('Обновляю статус...');
      await updateLaterTaskStatus(pageId, newStatus);
      
      // Обновляем задачу
      await this.refreshLaterTask(ctx, shortId);
      await ctx.answerCbQuery(`✅ Статус изменен на "${newStatus}"`);
    } catch (error: any) {
      console.error('Error updating later task status:', error);
      await ctx.answerCbQuery('Ошибка обновления');
      const errorMsg = await ctx.reply(`❌ Ошибка: ${error.message}`);
      userStateService.trackBotMessage(ctx.from!.id, errorMsg.message_id);
    }
  }

  /**
   * Обработчик удаления задачи "Позже".
   */
  async handleLaterTaskDelete(ctx: Context, shortId: string): Promise<void> {
    try {
      const pageId = userStateService.getTaskPageId(shortId);
      if (!pageId) {
        await ctx.answerCbQuery('❌ Задача не найдена');
        return;
      }

      await ctx.answerCbQuery('Удаляю...');
      
      const { Client } = await import('@notionhq/client');
      const notion = new Client({ auth: process.env.NOTION_API_KEY });
      
      await notion.pages.update({
        page_id: pageId,
        archived: true
      });

      // Удаляем регистрацию задачи
      userStateService.unregisterTaskId(shortId);

      if ('callback_query' in ctx.update && ctx.update.callback_query.message) {
        await ctx.deleteMessage();
      }
      
      await ctx.answerCbQuery('✅ Задача удалена');
      
      // Возвращаемся к начальному меню (списку статусов)
      await this.handleLaterBackToStatuses(ctx);
    } catch (error: any) {
      console.error('Error deleting later task:', error);
      await ctx.answerCbQuery('❌ Ошибка удаления');
      const errorMsg = await ctx.reply(`❌ Ошибка: ${error.message}`);
      userStateService.trackBotMessage(ctx.from!.id, errorMsg.message_id);
    }
  }

  /**
   * Обработчик переключения чекбокса задачи "Позже".
   */
  async handleLaterTaskCheckboxToggle(ctx: Context, shortId: string, propertyNameShort: string): Promise<void> {
    try {
      const pageId = userStateService.getTaskPageId(shortId);
      if (!pageId) {
        await ctx.answerCbQuery('❌ Задача не найдена');
        return;
      }

      // Получаем чекбоксы, которые действительно существуют на странице
      const currentCheckboxes = await getLaterTaskCheckboxes(pageId);
      const checkbox = currentCheckboxes.find(cb => cb.propertyName.startsWith(propertyNameShort));
      
      if (!checkbox) {
        await ctx.answerCbQuery('❌ Чекбокс не найден на этой странице');
        return;
      }

      const newValue = !checkbox.checked;

      await ctx.answerCbQuery('Обновляю чекбокс...');
      
      try {
        await updateDayRoutineTaskCheckbox(pageId, checkbox.propertyName, newValue);
      } catch (error: any) {
        // Если поле не существует на странице, показываем понятное сообщение
        if (error.message && error.message.includes('is not a property that exists')) {
          await ctx.answerCbQuery('❌ Это поле не доступно для этой задачи');
          return;
        }
        throw error;
      }

      // Обновляем задачу
      await this.refreshLaterTask(ctx, shortId);
      await ctx.answerCbQuery(newValue ? `✅ ${checkbox.label} отмечено` : `⬜ ${checkbox.label} снято`);
    } catch (error: any) {
      console.error('Error toggling later task checkbox:', error);
      await ctx.answerCbQuery('Ошибка обновления чекбокса');
      const errorMsg = await ctx.reply(`❌ Ошибка: ${error.message}`);
      userStateService.trackBotMessage(ctx.from!.id, errorMsg.message_id);
    }
  }

  /**
   * Обработчик редактирования поля задачи "Позже".
   */
  async handleLaterTaskEditProperty(ctx: Context, shortId: string, propertyNameShort: string, propertyTypeShort: string): Promise<void> {
    try {
      const pageId = userStateService.getTaskPageId(shortId);
      if (!pageId) {
        await ctx.answerCbQuery('❌ Задача не найдена');
        return;
      }

      await ctx.answerCbQuery('Загружаю...');
      
      const editableProperties = await getPageEditableProperties(pageId);
      const property = editableProperties.find(p => p.name.startsWith(propertyNameShort));
      
      if (!property) {
        await ctx.answerCbQuery('❌ Поле не найдено');
        return;
      }

      if (property.type === 'select' || property.type === 'status') {
        if (property.options && property.options.length > 0) {
          const keyboard = keyboardService.getPropertyOptionsKeyboard(shortId, property.name, property.type, property.options, property.value);
          const message = `Выбери новое значение для поля "${property.name}":\n\nТекущее: ${property.value || 'не установлено'}`;
          
          await ctx.answerCbQuery();
          if ('callback_query' in ctx.update && ctx.update.callback_query.message) {
            await ctx.editMessageText(message, keyboard);
          } else {
            const sentMessage = await ctx.reply(message, keyboard);
            userStateService.trackBotMessage(ctx.from!.id, sentMessage.message_id);
          }
        } else {
          await ctx.answerCbQuery('❌ Нет доступных опций');
        }
      } else if (property.type === 'checkbox') {
        const newValue = property.value !== 'true';
        await ctx.answerCbQuery('Обновляю...');
        await updatePageProperty(pageId, property.name, property.type, newValue);
        
        // Обновляем задачу
        await this.refreshLaterTask(ctx, shortId);
        await ctx.answerCbQuery(newValue ? `✅ ${property.name} отмечено` : `⬜ ${property.name} снято`);
      } else {
        userStateService.setUserEditMode(ctx.from!.id, shortId, property.name, property.type);
        
        let promptMessage = `✍️ Введи новое значение для поля "${property.name}":\n\n`;
        promptMessage += `Текущее: ${property.value || 'не установлено'}\n\n`;
        
        if (property.type === 'number') {
          promptMessage += 'Введи число:';
        } else if (property.type === 'date') {
          promptMessage += 'Введи дату в формате YYYY-MM-DD:';
        } else if (property.type === 'url') {
          promptMessage += 'Введи URL:';
        } else if (property.type === 'email') {
          promptMessage += 'Введи email:';
        } else if (property.type === 'phone_number') {
          promptMessage += 'Введи номер телефона:';
        } else {
          promptMessage += 'Введи текст:';
        }
        
        await ctx.answerCbQuery();
        const sentMessage = await ctx.reply(promptMessage);
        userStateService.trackBotMessage(ctx.from!.id, sentMessage.message_id);
      }
    } catch (error: any) {
      console.error('Error editing later task property:', error);
      await ctx.answerCbQuery('Ошибка');
      const errorMsg = await ctx.reply(`❌ Ошибка: ${error.message}`);
      userStateService.trackBotMessage(ctx.from!.id, errorMsg.message_id);
    }
  }

  /**
   * Обработчик выбора значения для select/status поля "Позже".
   */
  async handleLaterTaskPropertyOption(ctx: Context, shortId: string, propertyNameShort: string, propertyTypeShort: string, optionShort: string): Promise<void> {
    try {
      const pageId = userStateService.getTaskPageId(shortId);
      if (!pageId) {
        await ctx.answerCbQuery('❌ Задача не найдена');
        return;
      }

      await ctx.answerCbQuery('Загружаю...');
      
      const editableProperties = await getPageEditableProperties(pageId);
      const property = editableProperties.find(p => p.name.startsWith(propertyNameShort));
      
      if (!property || !property.options) {
        await ctx.answerCbQuery('❌ Поле не найдено');
        return;
      }

      const option = property.options.find(opt => opt.startsWith(optionShort));
      if (!option) {
        await ctx.answerCbQuery('❌ Опция не найдена');
        return;
      }

      await ctx.answerCbQuery('Обновляю...');
      await updatePageProperty(pageId, property.name, property.type, option);
      
      // Обновляем задачу
      await this.refreshLaterTask(ctx, shortId);
      await ctx.answerCbQuery(`✅ ${property.name} изменено на "${option}"`);
    } catch (error: any) {
      console.error('Error updating later task property option:', error);
      await ctx.answerCbQuery('Ошибка обновления');
      const errorMsg = await ctx.reply(`❌ Ошибка: ${error.message}`);
      userStateService.trackBotMessage(ctx.from!.id, errorMsg.message_id);
    }
  }

  /**
   * Обработчик отмены редактирования поля "Позже".
   */
  async handleLaterTaskCancelEdit(ctx: Context, shortId: string): Promise<void> {
    userStateService.clearUserEditMode(ctx.from!.id);
    await ctx.answerCbQuery('❌ Отменено');
    await this.refreshLaterTask(ctx, shortId);
  }
}

// Экспортируем singleton экземпляр
export const actionHandlers = new ActionHandlers();

