import { Markup } from 'telegraf';
import { DATABASES, NotionDatabaseKey } from '../config/databases';
import { getMorningRoutineTasksDynamic, getDayRoutineTasksDynamic, getDayRoutineStatuses } from '../services/notion';
import { MorningTask } from '../types';

/**
 * Сервис для генерации клавиатур Telegram.
 * Отвечает за создание всех типов клавиатур в боте.
 */
export class KeyboardService {
  /**
   * Генерирует главное меню (Reply-клавиатура).
   */
  getMainMenuKeyboard() {
    return Markup.keyboard([
      ["☀️ Утро", "🕒 День"],
      ["🌙 Вечер", "💡 Привычки"],
      ["📅 План дня", "❓ Помощь"],
    ]).resize();
  }
  /**
   * Генерирует клавиатуру выбора базы данных.
   */
  getDatabaseKeyboard() {
    const buttons = (Object.keys(DATABASES) as NotionDatabaseKey[])
      .filter((key) => DATABASES[key].id !== '')
      .map((key) => {
        const config = DATABASES[key];
        return Markup.button.callback(config.buttonText, `db:${key}`);
      });

    return Markup.inlineKeyboard(buttons, { columns: 2 });
  }

  /**
   * Генерирует клавиатуру действий для выбранной базы.
   */
  getActionsKeyboard(dbKey: NotionDatabaseKey) {
    const config = DATABASES[dbKey];
    if (!config.actions) return undefined;

    const buttons = config.actions.map(action => 
      Markup.button.callback(action.buttonText, `action:${action.type}:${dbKey}`)
    );
    
    return Markup.inlineKeyboard(buttons, { columns: 1 });
  }

  /**
   * Динамически генерирует клавиатуру утренней рутины на основе актуальных свойств базы.
   */
  async getMorningRoutineKeyboard(status: Record<string, boolean> = {}) {
    // Получаем список задач динамически из Notion (только чекбоксы)
    const tasks = await getMorningRoutineTasksDynamic();
    
    const buttons = tasks.map((task: MorningTask) => {
      const isDone = status[task.propertyName] || false;
      const icon = isDone ? '✅' : '⬜';
      
      return Markup.button.callback(
        `${icon} ${task.label}`, 
        `morning_task:${task.propertyName}` 
      );
    });
    
    return Markup.inlineKeyboard(buttons, { columns: 1 });
  }

  /**
   * Динамически генерирует клавиатуру дневной рутины на основе актуальных свойств базы.
   */
  async getDayRoutineKeyboard(status: Record<string, boolean> = {}) {
    // Получаем список задач динамически из Notion (только чекбоксы)
    const tasks = await getDayRoutineTasksDynamic();
    
    const buttons = tasks.map((task: MorningTask) => {
      const isDone = status[task.propertyName] || false;
      const icon = isDone ? '✅' : '⬜';
      
      return Markup.button.callback(
        `${icon} ${task.label}`, 
        `day_task:${task.propertyName}` 
      );
    });
    
    return Markup.inlineKeyboard(buttons, { columns: 1 });
  }

  /**
   * Генерирует клавиатуру со статусами для дневной рутины.
   */
  async getDayRoutineStatusesKeyboard() {
    const statuses = await getDayRoutineStatuses();
    
    const buttons = statuses.map((status: string) => 
      Markup.button.callback(status, `day_status:${status}`)
    );
    
    return Markup.inlineKeyboard(buttons, { columns: 2 });
  }
}

// Экспортируем singleton экземпляр
export const keyboardService = new KeyboardService();

