import { Markup } from 'telegraf';
import { DATABASES, NotionDatabaseKey } from '../config/databases';
import { getMorningRoutineTasksDynamic, getDayRoutineTasksDynamic, getDayRoutineStatuses, DayRoutineTask } from '../services/notion';
import { MorningTask } from '../types';
import { userStateService } from '../services/userState';

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

  /**
   * Генерирует клавиатуру для управления задачей дневной рутины.
   */
  async getDayRoutineTaskKeyboard(task: DayRoutineTask, checkboxes?: Array<{ propertyName: string; label: string; checked: boolean }>) {
    const statuses = await getDayRoutineStatuses();
    
    // Используем короткий ID вместо полного pageId для callback_data
    const shortId = userStateService.registerTaskId(task.pageId);
    
    const buttons: any[] = [];
    
    // Добавляем чекбоксы над кнопками управления (если есть)
    if (checkboxes && checkboxes.length > 0) {
      const checkboxButtons = checkboxes.map(checkbox => {
        const icon = checkbox.checked ? '✅' : '⬜';
        // Обрезаем название чекбокса для callback_data (максимум 30 символов)
        const propNameShort = checkbox.propertyName.length > 30 ? checkbox.propertyName.substring(0, 30) : checkbox.propertyName;
        return Markup.button.callback(
          `${icon} ${checkbox.label}`,
          `dc:${shortId}:${propNameShort}`
        );
      });
      
      // Добавляем чекбоксы по одному в ряд
      checkboxButtons.forEach(btn => buttons.push([btn]));
    }
    
    // Кнопки для изменения статуса (только другие статусы, не текущий)
    // Ограничиваем длину статуса в callback_data (максимум 20 символов)
    const statusButtons = statuses
      .filter(status => status !== task.status)
      .map(status => {
        // Обрезаем статус до 20 символов для callback_data
        const statusShort = status.length > 20 ? status.substring(0, 20) : status;
        return Markup.button.callback(`🔄 ${status}`, `ds:${shortId}:${statusShort}`);
      });
    
    // Добавляем кнопки статусов по 2 в ряд
    for (let i = 0; i < statusButtons.length; i += 2) {
      if (i + 1 < statusButtons.length) {
        buttons.push([statusButtons[i], statusButtons[i + 1]]);
      } else {
        buttons.push([statusButtons[i]]);
      }
    }
    
    // Кнопка для обновления задачи
    const refreshButton = Markup.button.callback('🔄 Обновить', `dr:${shortId}`);
    
    // Кнопка для удаления задачи
    const deleteButton = Markup.button.callback('🗑️ Удалить', `dd:${shortId}`);
    
    // Добавляем кнопки действий
    if (statusButtons.length > 0 || (checkboxes && checkboxes.length > 0)) {
      buttons.push([refreshButton, deleteButton]);
    } else {
      buttons.push([refreshButton]);
      buttons.push([deleteButton]);
    }
    
    return Markup.inlineKeyboard(buttons);
  }
}

// Экспортируем singleton экземпляр
export const keyboardService = new KeyboardService();

