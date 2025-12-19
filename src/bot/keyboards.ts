import { InlineKeyboard } from 'grammy';
import { Task } from '../notion/types';

/**
 * Main menu keyboard
 */
export function mainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('Входящие', 'inbox')
    .text('Сегодня', 'today');
}

/**
 * Settings keyboard
 */
export function settingsKeyboard(reminderMinutes: number, remindersEnabled: boolean): InlineKeyboard {
  const kb = new InlineKeyboard();
  
  // Toggle reminders
  kb.text(remindersEnabled ? 'Уведомления: вкл' : 'Уведомления: выкл', 'toggle_reminders');
  kb.row();
  
  // Reminder time options
  kb.text(reminderMinutes === 5 ? '• 5 мин •' : '5 мин', 'set_reminder:5');
  kb.text(reminderMinutes === 10 ? '• 10 мин •' : '10 мин', 'set_reminder:10');
  kb.text(reminderMinutes === 15 ? '• 15 мин •' : '15 мин', 'set_reminder:15');
  kb.row();
  kb.text('Меню', 'menu');
  
  return kb;
}

/**
 * Back to menu keyboard
 */
export function backKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text('Меню', 'menu');
}

/**
 * Pagination keyboard with page numbers
 */
export function paginationKeyboard(
  prefix: string,
  currentPage: number,
  totalPages: number,
  showMenu = true
): InlineKeyboard {
  const kb = new InlineKeyboard();

  if (totalPages <= 1) {
    if (showMenu) kb.text('Меню', 'menu');
    return kb;
  }

  // If 4 or fewer pages - show all page numbers
  if (totalPages <= 3) {
    for (let i = 0; i < totalPages; i++) {
      if (i === currentPage) {
        kb.text(`• ${i + 1} •`, `${prefix}_noop`);
      } else {
        kb.text(`${i + 1}`, `${prefix}_page:${i}`);
      }
    }
  } else {
    // More than 5 pages - show navigation

    // First page button
    if (currentPage > 1) {
      kb.text('« 1', `${prefix}_page:0`);
    }

    // Prev button
    if (currentPage > 0) {
      kb.text('‹', `${prefix}_prev`);
    }

    // Current page indicator
    kb.text(`${currentPage + 1}/${totalPages}`, `${prefix}_noop`);

    // Next button
    if (currentPage < totalPages - 1) {
      kb.text('›', `${prefix}_next`);
    }

    // Last page button
    if (currentPage < totalPages - 2) {
      kb.text(`${totalPages} »`, `${prefix}_page:${totalPages - 1}`);
    }
  }

  if (showMenu) {
    kb.row().text('Меню', 'menu');
  }

  return kb;
}

/**
 * Task action keyboard (for single task)
 */
export function taskKeyboard(
  taskId: string,
  options?: { showMenu?: boolean; pagination?: { prefix: string; page: number; total: number }; hideSetDoing?: boolean }
): InlineKeyboard {
  const kb = new InlineKeyboard();

  if (!options?.hideSetDoing) {
    kb.text('В работу', `set_today:${taskId}`);
  }

  kb.url('Открыть', `https://notion.so/${taskId.replace(/-/g, '')}`);

  if (options?.pagination) {
    const { prefix, page, total } = options.pagination;
    if (total > 1) {
      kb.row();
      if (total <= 3) {
        for (let i = 0; i < total; i++) {
          if (i === page) {
            kb.text(`• ${i + 1} •`, `${prefix}_noop`);
          } else {
            kb.text(`${i + 1}`, `${prefix}_page:${i}`);
          }
        }
      } else {
        if (page > 1) kb.text('« 1', `${prefix}_page:0`);
        if (page > 0) kb.text('‹', `${prefix}_prev`);
        kb.text(`${page + 1}/${total}`, `${prefix}_noop`);
        if (page < total - 1) kb.text('›', `${prefix}_next`);
        if (page < total - 2) kb.text(`${total} »`, `${prefix}_page:${total - 1}`);
      }
    }
  }

  if (options?.showMenu) {
    kb.row().text('Меню', 'menu');
  }

  return kb;
}

/**
 * Cancel keyboard (for add task flow)
 */
export function cancelKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text('Отмена', 'menu');
}

/**
 * Confirm add task keyboard
 */
export function confirmAddKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('Да, добавить', 'confirm_add')
    .text('Нет', 'cancel_add');
}

/**
 * Status selection keyboard (for newly created tasks)
 */
export function statusSelectionKeyboard(taskId: string, statuses: string[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  
  // Add buttons for each status (max 3 per row)
  for (let i = 0; i < statuses.length; i++) {
    if (i > 0 && i % 3 === 0) {
      kb.row();
    }
    kb.text(statuses[i], `set_status:${taskId}:${statuses[i]}`);
  }
  
  kb.row().url('Открыть', `https://notion.so/${taskId.replace(/-/g, '')}`).text('Меню', 'menu');
  
  return kb;
}
