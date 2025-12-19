import { Bot, Context } from 'grammy';
import { tasksRepo } from '../notion/repository';

// User settings
interface UserSettings {
  enabled: boolean;
  reminderMinutes: number;
}

// Store user settings
const userSettings = new Map<number, UserSettings>();

// Store already notified tasks (to avoid duplicates)
const notifiedTasks = new Set<string>();

// Default reminder minutes
const DEFAULT_REMINDER_MINUTES = 10;

/**
 * Register user for reminders
 */
export function registerUser(chatId: number) {
  if (!userSettings.has(chatId)) {
    userSettings.set(chatId, { enabled: true, reminderMinutes: DEFAULT_REMINDER_MINUTES });
  }
}

export function getUserSettings(chatId: number): UserSettings {
  return userSettings.get(chatId) || { enabled: true, reminderMinutes: DEFAULT_REMINDER_MINUTES };
}

export function setReminderMinutes(chatId: number, minutes: number) {
  const settings = getUserSettings(chatId);
  settings.reminderMinutes = minutes;
  userSettings.set(chatId, settings);
}

export function toggleReminders(chatId: number): boolean {
  const settings = getUserSettings(chatId);
  settings.enabled = !settings.enabled;
  userSettings.set(chatId, settings);
  return settings.enabled;
}

/**
 * Check tasks and send reminders
 */
async function checkReminders(bot: Bot<Context>) {
  if (userSettings.size === 0) return;

  try {
    const tasks = await tasksRepo.listUpcoming(60);
    const now = new Date();

    for (const [chatId, settings] of userSettings) {
      if (!settings.enabled) continue;

      for (const task of tasks) {
        const notifyKey = `${chatId}:${task.id}`;
        if (!task.due || notifiedTasks.has(notifyKey)) continue;

        const taskTime = new Date(task.due);
        const diffMs = taskTime.getTime() - now.getTime();
        const diffMinutes = Math.floor(diffMs / 60000);

        if (diffMinutes <= settings.reminderMinutes && diffMinutes >= 0) {
          notifiedTasks.add(notifyKey);

          const timeStr = taskTime.toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit',
          });

          const message = `${task.name}\n\nЧерез ${diffMinutes} мин (${timeStr})`;

          try {
            await bot.api.sendMessage(chatId, message);
          } catch (err) {
            console.error(`Failed to send reminder to ${chatId}:`, err);
          }
        }
      }
    }
  } catch (error) {
    console.error('Reminder check error:', error);
  }
}

/**
 * Start reminder scheduler
 */
export function startReminderScheduler(bot: Bot<Context>) {
  // Check every minute
  setInterval(() => checkReminders(bot), 60 * 1000);
  console.log('Reminder scheduler started');
}

