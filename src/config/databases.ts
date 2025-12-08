import 'dotenv/config';

export type NotionDatabaseKey =
  | 'morningRoutine'
  | 'dayRoutine'
  | 'eveningRoutine'
  | 'habits'
  | 'dailyPlan'
  | 'laterTasks';

export interface NotionDatabaseConfig {
  id: string;
  title: string;
  buttonText: string;
  propName?: string; // Опциональное имя свойства заголовка, по умолчанию 'Name'
  actions?: {
    type: 'create' | 'list';
    buttonText: string;
  }[];
  // routineTasks удалено, так как теперь используется динамическая загрузка из Notion
}

export const DATABASES: Record<NotionDatabaseKey, NotionDatabaseConfig> = {
  morningRoutine: {
    id: process.env.NOTION_DB_MORNING_ROUTINE_ID || '',
    title: 'Утренняя рутина',
    buttonText: '☀️ Утро',
    propName: 'Утро',
    actions: [
      { type: 'create', buttonText: '➕ Добавить утреннюю задачу' },
      { type: 'list', buttonText: '📋 Утренний план на сегодня' },
    ],
  },
  dayRoutine: {
    id: process.env.NOTION_DB_DAY_ROUTINE_ID || '',
    title: 'Дневные задачи',
    buttonText: '🕒 День',
    actions: [
      { type: 'create', buttonText: '➕ Добавить дневную задачу' },
      { type: 'list', buttonText: '📋 Дневной план на сегодня' },
    ],
  },
  eveningRoutine: {
    id: process.env.NOTION_DB_EVENING_ROUTINE_ID || '',
    title: 'Вечерняя рутина',
    buttonText: '🌙 Вечер',
    actions: [
      { type: 'create', buttonText: '➕ Добавить вечернюю задачу' },
      { type: 'list', buttonText: '📋 Вечерний план на сегодня' },
    ],
  },
  habits: {
    id: process.env.NOTION_DB_HABITS_ID || '',
    title: 'Привычки',
    buttonText: '💡 Привычки',
    actions: [
      { type: 'create', buttonText: '➕ Новая привычка' },
      { type: 'list', buttonText: '📋 Все привычки' },
    ],
  },
  dailyPlan: {
    id: process.env.NOTION_DB_DAILY_PLAN_ID || '',
    title: 'Дневной план',
    buttonText: '📅 Дневной план',
    actions: [
      { type: 'create', buttonText: '➕ Задача на сегодня' },
      { type: 'list', buttonText: '📋 План на сегодня' },
    ],
  },
  laterTasks: {
    id: process.env.NOTION_DB_LATER_TASKS_ID || '',
    title: 'Позже',
    buttonText: '📝 Позже',
    actions: [
      { type: 'create', buttonText: '➕ Добавить задачу' },
      { type: 'list', buttonText: '📋 Список задач' },
    ],
  },
};

export function getDatabaseByKey(key: NotionDatabaseKey): NotionDatabaseConfig {
  return DATABASES[key];
}
