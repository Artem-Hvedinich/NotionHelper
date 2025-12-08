import { NotionDatabaseKey } from '../config/databases';

/**
 * Состояние пользователя для конкретного потока взаимодействия.
 */
export interface UserModeState {
  mode: 'idle' | 'create';
  dbKey?: NotionDatabaseKey;
}

/**
 * Не-чекбокс свойство страницы Notion.
 */
export interface NonCheckboxProperty {
  name: string;
  value: string;
  type: string;
}

/**
 * Задача утренней рутины.
 */
export interface MorningTask {
  propertyName: string;
  label: string;
}

/**
 * Задача дневной рутины.
 */
export interface DayRoutineTask {
  pageId: string;
  title: string;
  status: string;
  lastEditedTime: string;
}

