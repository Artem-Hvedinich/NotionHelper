/**
 * Утилиты для форматирования сообщений бота.
 * Обеспечивают единообразное и красивое отображение информации.
 */

/**
 * Определяет эмодзи для статуса на основе ключевых слов.
 * Гибкая система, которая работает с любыми статусами.
 */
export function getStatusEmoji(status: string): string {
  const statusLower = status.toLowerCase();
  
  // Маппинг ключевых слов на эмодзи
  if (statusLower.includes('готово') || statusLower.includes('done') || 
      statusLower.includes('завершено') || statusLower.includes('completed') ||
      statusLower.includes('выполнено') || statusLower.includes('finished')) {
    return '✅';
  }
  if (statusLower.includes('работа') || statusLower.includes('work') || 
      statusLower.includes('в процессе') || statusLower.includes('in progress')) {
    return '🔄';
  }
  if (statusLower.includes('отложено') || statusLower.includes('deferred') || 
      statusLower.includes('пауза') || statusLower.includes('pause')) {
    return '⏸️';
  }
  if (statusLower.includes('ожидани') || statusLower.includes('waiting') || 
      statusLower.includes('pending') || statusLower.includes('жду')) {
    return '⏳';
  }
  if (statusLower.includes('youtube') || statusLower.includes('ютуб')) {
    return '📺';
  }
  if (statusLower.includes('нов') || statusLower.includes('new') || 
      statusLower.includes('создан') || statusLower.includes('created')) {
    return '🆕';
  }
  if (statusLower.includes('отмен') || statusLower.includes('cancel') || 
      statusLower.includes('удален') || statusLower.includes('deleted')) {
    return '❌';
  }
  if (statusLower.includes('важн') || statusLower.includes('important') || 
      statusLower.includes('приоритет') || statusLower.includes('priority')) {
    return '🔴';
  }
  if (statusLower.includes('провер') || statusLower.includes('review') || 
      statusLower.includes('на проверке')) {
    return '👀';
  }
  if (statusLower.includes('блок') || statusLower.includes('block') || 
      statusLower.includes('заблокирован')) {
    return '🚫';
  }
  
  // Дефолтный эмодзи для неизвестных статусов
  return '📋';
}

/**
 * Форматирует статус с эмодзи для красивого отображения.
 */
export function formatStatus(status: string): string {
  const emoji = getStatusEmoji(status);
  return `${emoji} ${status}`;
}

/**
 * Создает горизонтальный разделитель заданной длины.
 */
export function createSeparator(length: number = 20, char: string = '─'): string {
  return char.repeat(length);
}

/**
 * Создает заголовок с разделителями.
 */
export function createHeader(title: string, emoji?: string, length: number = 20): string {
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
  const empty = length - filled;

  let bar = '●'.repeat(filled);
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
    result += `*Осталось* (${pendingTasks.length}):\n`;
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
  message += `📊 *Статус*: ${formatStatus(status)}`;

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
  const statusWithEmoji = formatStatus(status);
  let message = `📋 *${statusWithEmoji}*`;

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
 * Форматирует сообщение выбора статуса для дневных задач.
 */
export function formatDayStatusSelection(): string {
  return createHeader('Дневные задачи', '🕒', 20) + '\n\n*Выбери статус:*';
}

/**
 * Форматирует сообщение выбора статуса для "Позже".
 */
export function formatLaterStatusSelection(): string {
  return createHeader('Позже', '📝', 20) + '\n\n*Выбери статус:*';
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

