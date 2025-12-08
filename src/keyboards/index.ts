import { Markup } from 'telegraf';
import { DATABASES, NotionDatabaseKey } from '../config/databases';
import { getMorningRoutineTasksDynamic, getDayRoutineTasksDynamic, getDayRoutineStatuses, getPageEditableProperties, getLaterTasksStatuses, getDatabaseStatuses, getDatabaseKeyByPageId } from '../services/notion';
import { MorningTask, DayRoutineTask } from '../types';
import { userStateService } from '../services/userState';
import { getStatusEmoji } from '../utils/formatter';

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
      ["/start", "❓ Помощь"],
      ["☀️ Утро", "🕒 День"],
      ["📝 Позже", "🌙 Вечер"],
      ["📅 План дня", "💡 Привычки"],
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
    
    const buttons = statuses.map((status: string) => {
      const emoji = getStatusEmoji(status);
      return Markup.button.callback(`${emoji} ${status}`, `day_status:${status}`);
    });
    
    // Добавляем кнопку "Добавить задачу" с более коротким текстом
    buttons.push(Markup.button.callback('➕ Добавить', 'day_add_task'));

    return Markup.inlineKeyboard(buttons, { columns: 2 });
  }

  /**
   * Генерирует клавиатуру со статусами для "Позже".
   */
  async getLaterTasksStatusesKeyboard() {
    const statuses = await getLaterTasksStatuses();
    
    const buttons = statuses.map((status: string) => {
      const emoji = getStatusEmoji(status);
      return Markup.button.callback(`${emoji} ${status}`, `later_status:${status}`);
    });
    
    // Добавляем кнопку "Добавить задачу" с более коротким текстом
    buttons.push(Markup.button.callback('➕ Добавить', 'later_add_task'));

    return Markup.inlineKeyboard(buttons, { columns: 2 });
  }

  /**
   * Генерирует клавиатуру со списком задач (компактный список).
   */
  getDayRoutineTasksListKeyboard(tasks: DayRoutineTask[]) {
    const buttons = tasks.map((task: DayRoutineTask) => {
      const shortId = userStateService.registerTaskId(task.pageId);
      // Обрезаем название задачи для кнопки (максимум 30 символов)
      const titleShort = task.title.length > 30 ? task.title.substring(0, 27) + '...' : task.title;
      return Markup.button.callback(`📌 ${titleShort}`, `dt:${shortId}`);
    });
    
    // Добавляем кнопку "Назад" в конец
    buttons.push(Markup.button.callback('◀️ Назад к статусам', 'day_back_statuses'));
    
    return Markup.inlineKeyboard(buttons, { columns: 1 });
  }

  /**
   * Генерирует клавиатуру со списком задач "Позже" (компактный список).
   */
  getLaterTasksListKeyboard(tasks: DayRoutineTask[]) {
    const buttons = tasks.map((task: DayRoutineTask) => {
      const shortId = userStateService.registerTaskId(task.pageId);
      const titleShort = task.title.length > 30 ? task.title.substring(0, 27) + '...' : task.title;
      return Markup.button.callback(`📌 ${titleShort}`, `lt:${shortId}`);
    });
    
    buttons.push(Markup.button.callback('◀️ Назад к статусам', 'later_back_statuses'));
    
    return Markup.inlineKeyboard(buttons, { columns: 1 });
  }

  /**
   * Генерирует клавиатуру для управления задачей дневной рутины.
   */
  async getDayRoutineTaskKeyboard(task: DayRoutineTask, checkboxes?: Array<{ propertyName: string; label: string; checked: boolean }>, editableProperties?: Array<{ name: string; type: string; value: string; options?: string[] }>) {
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
    
    // Добавляем кнопки для редактирования всех полей (кроме чекбоксов и статуса)
    if (editableProperties && editableProperties.length > 0) {
      // Пропускаем статус, так как он уже обрабатывается отдельно
      const statusPropertyName = await this.findStatusPropertyName(task.pageId);
      
      // Сначала добавляем title (если есть), затем остальные поля
      const titleProp = editableProperties.find(p => p.type === 'title');
      if (titleProp) {
        let buttonText = `✏️ ${titleProp.name}`;
        if (titleProp.value) {
          const valueDisplay = titleProp.value.length > 15 ? titleProp.value.substring(0, 12) + '...' : titleProp.value;
          buttonText += `: ${valueDisplay}`;
        }
        const propNameShort = titleProp.name.length > 25 ? titleProp.name.substring(0, 25) : titleProp.name;
        const propTypeShort = titleProp.type.length > 10 ? titleProp.type.substring(0, 10) : titleProp.type;
        buttons.push([Markup.button.callback(buttonText, `de:${shortId}:${propNameShort}:${propTypeShort}`)]);
      }
      
      // Затем добавляем остальные поля (кроме title, checkbox и status)
      editableProperties.forEach(prop => {
        // Пропускаем статус (он обрабатывается отдельно), чекбоксы и title (уже добавлен)
        if (prop.type === 'checkbox' || prop.type === 'title' || prop.name === statusPropertyName) {
          return;
        }
        
        // Формируем текст кнопки с текущим значением
        let buttonText = `✏️ ${prop.name}`;
        if (prop.value) {
          const valueDisplay = prop.value.length > 15 ? prop.value.substring(0, 12) + '...' : prop.value;
          buttonText += `: ${valueDisplay}`;
        }
        
        // Обрезаем название свойства для callback_data
        const propNameShort = prop.name.length > 25 ? prop.name.substring(0, 25) : prop.name;
        const propTypeShort = prop.type.length > 10 ? prop.type.substring(0, 10) : prop.type;
        
        buttons.push([Markup.button.callback(buttonText, `de:${shortId}:${propNameShort}:${propTypeShort}`)]);
      });
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
    
    // Кнопка для удаления задачи
    const deleteButton = Markup.button.callback('🗑️ Удалить', `dd:${shortId}`);
    
    // Добавляем кнопку удаления
    buttons.push([deleteButton]);
    
    // Добавляем кнопку "Назад к списку" (используем сохраненный статус из userState)
    const backButton = Markup.button.callback('◀️ Назад к списку', `dbl:${shortId}`);
    buttons.push([backButton]);
    
    return Markup.inlineKeyboard(buttons);
  }

  /**
   * Генерирует клавиатуру для управления задачей "Позже".
   */
  async getLaterTaskKeyboard(task: DayRoutineTask, checkboxes?: Array<{ propertyName: string; label: string; checked: boolean }>, editableProperties?: Array<{ name: string; type: string; value: string; options?: string[] }>) {
    // Автоматически определяем базу данных по pageId для получения правильных статусов
    const dbKey = await getDatabaseKeyByPageId(task.pageId) || 'laterTasks';
    const statuses = await getDatabaseStatuses(dbKey);
    
    const shortId = userStateService.registerTaskId(task.pageId);
    
    const buttons: any[] = [];
    
    if (checkboxes && checkboxes.length > 0) {
      const checkboxButtons = checkboxes.map(checkbox => {
        const icon = checkbox.checked ? '✅' : '⬜';
        const propNameShort = checkbox.propertyName.length > 30 ? checkbox.propertyName.substring(0, 30) : checkbox.propertyName;
        return Markup.button.callback(
          `${icon} ${checkbox.label}`,
          `lc:${shortId}:${propNameShort}`
        );
      });
      
      checkboxButtons.forEach(btn => buttons.push([btn]));
    }
    
    if (editableProperties && editableProperties.length > 0) {
      const statusPropertyName = await this.findStatusPropertyName(task.pageId);
      
      const titleProp = editableProperties.find(p => p.type === 'title');
      if (titleProp) {
        let buttonText = `✏️ ${titleProp.name}`;
        if (titleProp.value) {
          const valueDisplay = titleProp.value.length > 15 ? titleProp.value.substring(0, 12) + '...' : titleProp.value;
          buttonText += `: ${valueDisplay}`;
        }
        const propNameShort = titleProp.name.length > 25 ? titleProp.name.substring(0, 25) : titleProp.name;
        const propTypeShort = titleProp.type.length > 10 ? titleProp.type.substring(0, 10) : titleProp.type;
        buttons.push([Markup.button.callback(buttonText, `le:${shortId}:${propNameShort}:${propTypeShort}`)]);
      }
      
      editableProperties.forEach(prop => {
        if (prop.type === 'checkbox' || prop.type === 'title' || prop.name === statusPropertyName) {
          return;
        }
        
        let buttonText = `✏️ ${prop.name}`;
        if (prop.value) {
          const valueDisplay = prop.value.length > 15 ? prop.value.substring(0, 12) + '...' : prop.value;
          buttonText += `: ${valueDisplay}`;
        }
        
        const propNameShort = prop.name.length > 25 ? prop.name.substring(0, 25) : prop.name;
        const propTypeShort = prop.type.length > 10 ? prop.type.substring(0, 10) : prop.type;
        
        buttons.push([Markup.button.callback(buttonText, `le:${shortId}:${propNameShort}:${propTypeShort}`)]);
      });
    }
    
    const statusButtons = statuses
      .filter(status => status !== task.status)
      .map(status => {
        const statusShort = status.length > 20 ? status.substring(0, 20) : status;
        return Markup.button.callback(`🔄 ${status}`, `ls:${shortId}:${statusShort}`);
      });
    
    for (let i = 0; i < statusButtons.length; i += 2) {
      if (i + 1 < statusButtons.length) {
        buttons.push([statusButtons[i], statusButtons[i + 1]]);
      } else {
        buttons.push([statusButtons[i]]);
      }
    }
    
    const deleteButton = Markup.button.callback('🗑️ Удалить', `ld:${shortId}`);
    const backToListButton = Markup.button.callback('◀️ Назад к списку', `lbl:${shortId}`);

    if (statusButtons.length > 0 || (checkboxes && checkboxes.length > 0)) {
      buttons.push([deleteButton, backToListButton]);
    } else {
      buttons.push([deleteButton]);
      buttons.push([backToListButton]);
    }
    
    return Markup.inlineKeyboard(buttons);
  }

  /**
   * Вспомогательная функция для поиска названия поля статуса.
   */
  private async findStatusPropertyName(pageId: string): Promise<string | null> {
    try {
      const { findStatusProperty } = await import('../services/notion');
      const { Client } = await import('@notionhq/client');
      const notion = new Client({ auth: process.env.NOTION_API_KEY });
      const page = await notion.pages.retrieve({ page_id: pageId });
      const dbId = (page as any).parent?.database_id;
      if (dbId) {
        return await findStatusProperty(dbId);
      }
      // Fallback для dayRoutine
      const dbConfig = DATABASES.dayRoutine;
      return await findStatusProperty(dbConfig.id);
    } catch {
      return null;
    }
  }

  /**
   * Генерирует клавиатуру для выбора значения select/status поля.
   */
  getPropertyOptionsKeyboard(shortId: string, propertyName: string, propertyType: string, options: string[], currentValue?: string): any {
    const buttons: any[] = [];
    
    // Обрезаем название свойства для callback_data
    const propNameShort = propertyName.length > 25 ? propertyName.substring(0, 25) : propertyName;
    
    options.forEach(option => {
      const isSelected = option === currentValue;
      const icon = isSelected ? '✅' : '⬜';
      // Обрезаем опцию для callback_data
      const optionShort = option.length > 20 ? option.substring(0, 20) : option;
      buttons.push([Markup.button.callback(
        `${icon} ${option}`,
        `dp:${shortId}:${propNameShort}:${propertyType}:${optionShort}`
      )]);
    });
    
    // Кнопка "Отмена"
    buttons.push([Markup.button.callback('❌ Отмена', `dcancel:${shortId}`)]);
    
    return Markup.inlineKeyboard(buttons);
  }
}

// Экспортируем singleton экземпляр
export const keyboardService = new KeyboardService();

