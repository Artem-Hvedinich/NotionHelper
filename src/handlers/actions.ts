import { Context } from 'telegraf';
import { getDatabaseByKey, NotionDatabaseKey } from '../config/databases';
import { ensureTodayMorningRow, getMorningStatus, getMorningRoutineTasksDynamic, getPageNonCheckboxProperties, updateMorningTask, listTodayDailyPlan } from '../services/notion';
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
}

// Экспортируем singleton экземпляр
export const actionHandlers = new ActionHandlers();

