# 📋 Работа с Tasks

## ✅ Что реализовано

### Методы работы с задачами:

1. **Получение задач:**
   - `getTasksForDate(date)` - задачи на конкретную дату
   - `getTasksWithoutDate()` - задачи без даты (для инбокса)
   - `getAllTasks(limit)` - все задачи
   - `getTaskById(taskId)` - задача по ID
   - `getTasksByStatus(status)` - задачи по статусу
   - `getTasksByPriority(priority)` - задачи по приоритету

2. **Создание и обновление:**
   - `createTask(name, date?, addToPlan?)` - создать задачу
   - `updateTask(taskId, updates)` - обновить задачу (статус, дата, done, priority и т.д.)
   - `deleteTask(taskId)` - удалить (архивировать) задачу

3. **Утилиты:**
   - `inspectTasksDatabase()` - получить структуру базы Tasks
   - Улучшенная обработка ошибок с понятными сообщениями

## 🚀 Быстрый старт

### 1. Проверь структуру базы

```bash
npm run inspect:tasks
```

Этот скрипт покажет все свойства твоей базы Tasks и их типы.

### 2. Настрой названия свойств

Открой `src/config/notion.ts` и проверь, что названия свойств совпадают с твоей базой:

```typescript
export const TASKS_PROPERTIES = {
  NAME: 'Name',           // название задачи (title)
  STATUS: 'Status',       // статус (select)
  DONE: 'Done',           // выполнено (checkbox)
  DATE: 'Date',           // дата (date)
  TIME_START: 'TimeStart', // время начала (text)
  PROJECT: 'Project',     // проект (relation)
  GOAL: 'Goal',           // цель (relation)
  PRIORITY: 'Priority',   // приоритет (select)
} as const;
```

**Важно:** Если у тебя нет какого-то свойства (например, `STATUS` или `DONE`), можешь оставить название пустым или закомментировать использование.

### 3. Настрой .env

```env
NOTION_TOKEN=твой_notion_token
NOTION_DATABASE_TASKS_ID=id_базы_задач
```

### 4. Тестирование

Бот уже умеет:
- ➕ Создавать задачи через "Добавить задачу"
- 📅 Показывать задачи в "Сегодня" (если они в плане)

## 🔧 Примеры использования

### В коде:

```typescript
import { notionService } from './services/notion';

// Получить задачи на сегодня
const today = new Date().toISOString().split('T')[0];
const tasks = await notionService.getTasksForDate(today);

// Создать задачу
const task = await notionService.createTask('Новая задача', today, true);

// Обновить статус
await notionService.updateTask(taskId, { status: 'In Progress' });

// Отметить выполненной
await notionService.updateTask(taskId, { done: true });
```

## ⚠️ Важные замечания

1. **Обязательные свойства:**
   - `NAME` (title) - обязательно должно быть
   - `DATE` (date) - нужно для фильтрации по дате

2. **Опциональные свойства:**
   - `STATUS` или `DONE` - хотя бы одно для отслеживания выполнения
   - Остальные свойства опциональны

3. **Ошибки:**
   - Если видишь ошибку "object_not_found" - проверь DATABASES.TASKS_ID
   - Если видишь "validation_error" - проверь названия свойств в config/notion.ts

## 📝 Следующие шаги

- [ ] Добавить команду `/tasks` для просмотра всех задач
- [ ] Добавить фильтрацию задач по статусу в боте
- [ ] Добавить редактирование задач через бота
- [ ] Добавить удаление задач через бота

