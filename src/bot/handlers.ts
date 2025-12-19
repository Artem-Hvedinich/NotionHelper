import { Bot, Context, session, SessionFlavor } from 'grammy';
import { tasksRepo } from '../notion/repository';
import { escapeHtml } from '../utils/format';
import { mainMenuKeyboard, backKeyboard, taskKeyboard, cancelKeyboard, confirmAddKeyboard, settingsKeyboard, statusSelectionKeyboard } from './keyboards';
import { registerUser, getUserSettings, setReminderMinutes, toggleReminders } from './reminders';

// Session data
interface SessionData {
  waitingForTaskText?: boolean;
  messageIds?: number[]; // Track messages to delete
  inboxPage?: number;
  pendingTaskText?: string; // Text waiting for confirmation
}

type MyContext = Context & SessionFlavor<SessionData>;

export function setupBot(bot: Bot<MyContext>) {
  // Session middleware
  bot.use(session({ initial: (): SessionData => ({ messageIds: [] }) }));

  // Helper: track message for later deletion
  function trackMessage(ctx: MyContext, msgId: number) {
    if (!ctx.session.messageIds) ctx.session.messageIds = [];
    ctx.session.messageIds.push(msgId);
  }

  // Helper: delete tracked messages
  async function clearMessages(ctx: MyContext) {
    const ids = ctx.session.messageIds || [];
    for (const id of ids) {
      try {
        await ctx.api.deleteMessage(ctx.chat!.id, id);
      } catch {}
    }
    ctx.session.messageIds = [];
  }

  // Helper: show inbox list
  async function showInbox(ctx: MyContext, isEdit = false) {
    const page = ctx.session.inboxPage || 0;
    const pageSize = 5;
    const allTasks = await tasksRepo.listInbox(100);
    const tasks = allTasks.slice(page * pageSize, (page + 1) * pageSize);
    const totalPages = Math.ceil(allTasks.length / pageSize) || 1;
    const hasMore = page < totalPages - 1;
    const hasPrev = page > 0;

    if (allTasks.length === 0) {
      if (isEdit) {
        await ctx.editMessageText(
          `<b>Входящие</b>\n\nПусто.`,
          { parse_mode: 'HTML', reply_markup: backKeyboard() }
        );
      } else {
        await ctx.reply(
          `<b>Входящие</b>\n\nПусто.`,
          { parse_mode: 'HTML', reply_markup: backKeyboard() }
        );
      }
      return;
    }

    // Build header
    let text = `<b>Входящие</b> (${page + 1}/${totalPages})\n`;
    tasks.forEach((task, i) => {
      const num = page * pageSize + i + 1;
      text += `\n${num}. ${escapeHtml(task.name)}`;
    });

    if (isEdit) {
      await ctx.editMessageText(text, { parse_mode: 'HTML' });
    } else {
      const msg = await ctx.reply(text, { parse_mode: 'HTML' });
      trackMessage(ctx, msg.message_id);
    }

    // Send each task as separate message with buttons
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const isLast = i === tasks.length - 1;
      const msg = await ctx.reply(
        escapeHtml(task.name),
        { 
          reply_markup: taskKeyboard(task.id, {
            showMenu: isLast,
            pagination: isLast ? { prefix: 'inbox', page, total: totalPages } : undefined
          })
        }
      );
      trackMessage(ctx, msg.message_id);
    }
  }

  // /start
  bot.command('start', async (ctx) => {
    ctx.session.waitingForTaskText = false;
    ctx.session.messageIds = [];
    ctx.session.inboxPage = 0;
    
    // Register user for reminders
    if (ctx.chat?.id) {
      registerUser(ctx.chat.id);
    }
    
    await ctx.reply(
      `Привет\n\nЯ помогу управлять задачами.`,
      { reply_markup: mainMenuKeyboard() }
    );
  });

  // /help
  bot.command('help', async (ctx) => {
    await ctx.reply(
      `Используй кнопки ниже.`,
      { reply_markup: mainMenuKeyboard() }
    );
  });

  // /settings
  bot.command('settings', async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    
    const settings = getUserSettings(chatId);
    await ctx.reply(
      `<b>Настройки</b>\n\nУведомления за N минут до задачи`,
      { parse_mode: 'HTML', reply_markup: settingsKeyboard(settings.reminderMinutes, settings.enabled) }
    );
  });

  // --- Callback queries ---

  // Menu - clear messages and show menu
  bot.callbackQuery('menu', async (ctx) => {
    ctx.session.waitingForTaskText = false;
    ctx.session.inboxPage = 0;
    await ctx.answerCallbackQuery();
    
    // Delete current message first
    try {
      await ctx.deleteMessage();
    } catch {}
    
    // Delete all tracked messages
    await clearMessages(ctx);
    
    await ctx.reply(
      `Что делаем?`,
      { reply_markup: mainMenuKeyboard() }
    );
  });

  // Add task - start
  bot.callbackQuery('add_task', async (ctx) => {
    ctx.session.waitingForTaskText = true;
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `Напиши задачу:`,
      { reply_markup: cancelKeyboard() }
    );
  });

  // Inbox
  bot.callbackQuery('inbox', async (ctx) => {
    ctx.session.waitingForTaskText = false;
    ctx.session.messageIds = [];
    ctx.session.inboxPage = 0;
    await ctx.answerCallbackQuery();
    
    // Track the original message
    if (ctx.callbackQuery?.message?.message_id) {
      trackMessage(ctx, ctx.callbackQuery.message.message_id);
    }
    
    await ctx.editMessageText(`<b>Входящие</b>\n\nЗагрузка...`, { parse_mode: 'HTML' });
    await showInbox(ctx, true);
  });

  // Inbox pagination - prev
  bot.callbackQuery('inbox_prev', async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.inboxPage = Math.max(0, (ctx.session.inboxPage || 0) - 1);
    await clearMessages(ctx);
    await showInbox(ctx, false);
  });

  // Inbox pagination - next
  bot.callbackQuery('inbox_next', async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.inboxPage = (ctx.session.inboxPage || 0) + 1;
    await clearMessages(ctx);
    await showInbox(ctx, false);
  });

  // Inbox pagination - go to specific page
  bot.callbackQuery(/^inbox_page:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.inboxPage = parseInt(ctx.match[1]);
    await clearMessages(ctx);
    await showInbox(ctx, false);
  });

  // Noop (for current page indicator)
  bot.callbackQuery('inbox_noop', async (ctx) => {
    await ctx.answerCallbackQuery();
  });

  // Today
  bot.callbackQuery('today', async (ctx) => {
    ctx.session.waitingForTaskText = false;
    ctx.session.messageIds = [];
    await ctx.answerCallbackQuery();
    
    const tasks = await tasksRepo.listToday();
    
    if (tasks.length === 0) {
      await ctx.editMessageText(
        `<b>Сегодня</b>\n\nНет задач.`,
        { parse_mode: 'HTML', reply_markup: backKeyboard() }
      );
      return;
    }

    // Build single message with all tasks
    let text = `<b>Сегодня</b>\n`;
    tasks.forEach((task, i) => {
      text += `\n${i + 1}. ${escapeHtml(task.name)}`;
    });

    // Track the header message
    if (ctx.callbackQuery?.message?.message_id) {
      trackMessage(ctx, ctx.callbackQuery.message.message_id);
    }

    await ctx.editMessageText(text, { parse_mode: 'HTML' });

    // Send each task as separate message with buttons
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const isLast = i === tasks.length - 1;
      const msg = await ctx.reply(
        escapeHtml(task.name),
        { reply_markup: taskKeyboard(task.id, { showMenu: isLast }) }
      );
      trackMessage(ctx, msg.message_id);
    }
  });

  // Mark task done
  bot.callbackQuery(/^done:(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const ok = await tasksRepo.setDone(taskId);
    
    if (ok) {
      await ctx.answerCallbackQuery('Готово');
      await ctx.editMessageText('Готово');
    } else {
      await ctx.answerCallbackQuery('Ошибка');
    }
  });

  // Set task to doing
  bot.callbackQuery(/^set_today:(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const ok = await tasksRepo.setDoing(taskId);
    
    if (ok) {
      await ctx.answerCallbackQuery('В работе');
      await ctx.editMessageText('В работе');
    } else {
      await ctx.answerCallbackQuery('Ошибка');
    }
  });

  // Confirm add task from random text
  bot.callbackQuery('confirm_add', async (ctx) => {
    await ctx.answerCallbackQuery();
    
    const text = ctx.session.pendingTaskText;
    if (!text) {
      await ctx.editMessageText('Ошибка. Попробуй ещё раз.');
      return;
    }
    
    const task = await tasksRepo.create({ name: text });
    ctx.session.pendingTaskText = undefined;
    
    if (task) {
      // Get active statuses for selection (excluding inbox, done, archive)
      const activeStatuses = await tasksRepo.getActiveStatuses();
      
      if (activeStatuses.length > 0) {
        await ctx.editMessageText(
          `Задача добавлена.\n\nВыбери статус:`,
          { reply_markup: statusSelectionKeyboard(task.id, activeStatuses) }
        );
      } else {
        // No active statuses, show regular keyboard
        await ctx.editMessageText(
          `Задача добавлена.`,
          { reply_markup: taskKeyboard(task.id, { showMenu: true }) }
        );
      }
    } else {
      await ctx.editMessageText(
        `Ошибка. Попробуй ещё раз.`,
        { reply_markup: mainMenuKeyboard() }
      );
    }
  });

  // Set status for newly created task
  bot.callbackQuery(/^set_status:(.+):(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const statusName = ctx.match[2];
    
    const ok = await tasksRepo.setStatus(taskId, statusName, true);
    
    if (ok) {
      await ctx.answerCallbackQuery('Готово');
      await ctx.editMessageText(
        `Задача добавлена.\nСтатус: ${escapeHtml(statusName)}`,
        { parse_mode: 'HTML', reply_markup: taskKeyboard(taskId, { showMenu: true }) }
      );
    } else {
      await ctx.answerCallbackQuery('Ошибка');
      await ctx.editMessageText(
        `Ошибка. Попробуй ещё раз.`,
        { reply_markup: mainMenuKeyboard() }
      );
    }
  });

  // Cancel add task from random text
  bot.callbackQuery('cancel_add', async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.pendingTaskText = undefined;
    await ctx.deleteMessage();
  });

  // Settings
  bot.callbackQuery('settings', async (ctx) => {
    await ctx.answerCallbackQuery();
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    
    const settings = getUserSettings(chatId);
    await ctx.editMessageText(
      `<b>Настройки</b>\n\nУведомления за N минут до задачи`,
      { parse_mode: 'HTML', reply_markup: settingsKeyboard(settings.reminderMinutes, settings.enabled) }
    );
  });

  // Toggle reminders
  bot.callbackQuery('toggle_reminders', async (ctx) => {
    await ctx.answerCallbackQuery();
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    
    toggleReminders(chatId);
    const settings = getUserSettings(chatId);
    await ctx.editMessageReplyMarkup({
      reply_markup: settingsKeyboard(settings.reminderMinutes, settings.enabled)
    });
  });

  // Set reminder minutes
  bot.callbackQuery(/^set_reminder:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    
    const minutes = parseInt(ctx.match[1]);
    setReminderMinutes(chatId, minutes);
    const settings = getUserSettings(chatId);
    await ctx.editMessageReplyMarkup({
      reply_markup: settingsKeyboard(settings.reminderMinutes, settings.enabled)
    });
  });

  // --- Text messages ---
  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text;
    
    // If waiting for task text (from add button)
    if (ctx.session.waitingForTaskText) {
      // Delete user message
      try {
        await ctx.deleteMessage();
      } catch {}
      
      const task = await tasksRepo.create({ name: text });
      
      ctx.session.waitingForTaskText = false;
      
      if (task) {
        // Get active statuses for selection (excluding inbox, done, archive)
        const activeStatuses = await tasksRepo.getActiveStatuses();
        
        if (activeStatuses.length > 0) {
          const msg = await ctx.reply(
            `Задача добавлена.\n\nВыбери статус:`,
            { reply_markup: statusSelectionKeyboard(task.id, activeStatuses) }
          );
          trackMessage(ctx, msg.message_id);
        } else {
          // No active statuses, show regular keyboard
          const msg = await ctx.reply(
            `Задача добавлена.`,
            { reply_markup: taskKeyboard(task.id, { showMenu: true }) }
          );
          trackMessage(ctx, msg.message_id);
        }
      } else {
        await ctx.reply(
          `Ошибка. Попробуй ещё раз.`,
          { reply_markup: mainMenuKeyboard() }
        );
      }
      return;
    }
    
    // Random text - ask to add as task
    ctx.session.pendingTaskText = text;
    await ctx.reply(
      `Добавить в задачи?\n\n«${escapeHtml(text)}»`,
      { reply_markup: confirmAddKeyboard() }
    );
  });

  // Error handler
  bot.catch((err) => {
    console.error('Bot error:', err);
  });
}
