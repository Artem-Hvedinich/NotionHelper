/**
 * Утилиты для форматирования сообщений бота.
 * Обеспечивают единообразное и красивое отображение информации.
 */

/**
 * Создает горизонтальный разделитель заданной длины.
 */
export function createSeparator(length: number = 25, char: string = '─'): string {
  return char.repeat(length);
}

/**
 * Создает заголовок с разделителями.
 */
export function createHeader(title: string, emoji?: string, length: number = 25): string {
  const separator = createSeparator(length);
  const prefix = emoji ? `${emoji} ` : '';
  return `${prefix}*${title}*\n${separator}`;
}

/**
 * Создает блок с заголовком и содержимым.
 */
export function createBlock(title: string, content: string, emoji?: string): string {
  const prefix = emoji ? `${emoji} ` : '';
  return `${prefix}*${title}*:\n${content}`;
}

/**
 * Форматирует прогресс в виде текстового прогресс-бара.
 */
export function formatProgressBar(current: number, total: number, length: number = 10): string {
  if (total === 0) return '○'.repeat(length);
  
  const percentage = Math.round((current / total) * 100);
  const exactFilled = (current / total) * length;
  const filled = Math.floor(exactFilled);
  const hasPartial = exactFilled - filled >= 0.5; // Если остаток >= 0.5, показываем полузакрашенный
  const empty = length - filled - (hasPartial ? 1 : 0);
  
  // Используем символы: ● для заполненных, ◐ для частично заполненных, ○ для пустых
  let bar = '●'.repeat(filled);
  if (hasPartial) {
    bar += '◐'; // Полузакрашенный круг
  }
  bar += '○'.repeat(empty);
  
  return `${bar} ${percentage}%`;
}

/**
 * Форматирует список задач с чекбоксами.
 */
export function formatTaskList(
  completedTasks: Array<{ label: string; propertyName: string }>,
  pendingTasks: Array<{ label: string; propertyName: string }>,
  showCompleted: boolean = true
): string {
  let result = '';
  
  if (completedTasks.length > 0 && showCompleted) {
    result += `\n✅ *Выполнено* (${completedTasks.length}):\n`;
    completedTasks.forEach(task => {
      result += `✅ ${task.label}\n`;
    });
  }
  
  if (pendingTasks.length > 0) {
    if (result) result += '\n';
    result += `⬜ *Осталось* (${pendingTasks.length}):\n`;
    pendingTasks.forEach(task => {
      result += `⬜ ${task.label}\n`;
    });
  }
  
  return result;
}

/**
 * Форматирует статистику утренней/дневной рутины.
 */
export function formatRoutineStats(
  completed: number,
  total: number,
  score?: number | string,
  additionalStats?: Array<{ name: string; value: string }>
): string {
  const progressBar = formatProgressBar(completed, total);
  let stats = `📊 *Прогресс*: ${completed}/${total} ${progressBar}`;
  
  if (score !== undefined && score !== null) {
    stats += `\n⭐ *Оценка*: ${score}`;
  }
  
  if (additionalStats && additionalStats.length > 0) {
    additionalStats.forEach(stat => {
      stats += `\n${stat.name}: *${stat.value}*`;
    });
  }
  
  return stats;
}

/**
 * Форматирует информацию о задаче.
 */
export function formatTaskInfo(
  title: string,
  status: string,
  additionalFields?: Array<{ name: string; value: string }>
): string {
  let message = `📌 *${title}*\n\n`;
  message += `📊 *Статус*: ${status}`;
  
  if (additionalFields && additionalFields.length > 0) {
    message += '\n\n';
    additionalFields.forEach(field => {
      const valueDisplay = field.value.length > 50 
        ? field.value.substring(0, 47) + '...' 
        : field.value;
      message += `${field.name}: ${valueDisplay}\n`;
    });
  }
  
  return message;
}

/**
 * Форматирует список задач по статусам.
 */
export function formatTaskListByStatus(
  status: string,
  tasks: Array<{ title: string; shortId: string }>,
  totalCount?: number
): string {
  let message = `📋 *${status}*`;
  
  if (tasks.length === 0) {
    const statusLower = status.toLowerCase();
    const isDoneStatus = statusLower.includes('готово') || statusLower.includes('done') || 
                         statusLower.includes('завершено') || statusLower.includes('completed');
    message += `\n\n📭 Задач не найдено${isDoneStatus ? ' (отредактированных сегодня)' : ''}`;
  } else {
    if (totalCount !== undefined) {
      message += ` (${totalCount})`;
    }
    message += '\n\n';
    tasks.forEach((task, index) => {
      message += `${index + 1}. ${task.title}\n`;
    });
  }
  
  return message;
}

/**
 * Форматирует главное меню с приветствием.
 */
export function formatMainMenu(): string {
  return `👋 *Привет!*

Я бот для записи задач в Notion.

📋 *Выбери действие из меню ниже:*`;
}

/**
 * Форматирует сообщение о выборе базы данных.
 */
export function formatDatabaseSelection(dbTitle: string): string {
  return `✅ *Выбрана база*: ${dbTitle}

📝 *Что добавить?*`;
}

/**
 * Форматирует сообщение о создании задачи.
 */
export function formatTaskCreated(taskTitle: string): string {
  return `✅ *Задача создана!*\n\n📌 ${taskTitle}`;
}

/**
 * Форматирует сообщение с подтверждением удаления.
 */
export function formatDeleteConfirmation(taskTitle: string): string {
  return `⚠️ *Подтверждение удаления*

Вы уверены, что хотите удалить задачу:

*${taskTitle}*`;
}

