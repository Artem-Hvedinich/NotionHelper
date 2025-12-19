import { Bot, Context, session, SessionFlavor } from 'grammy';
import { tasksRepo } from '../notion/repository';
import { escapeHtml } from '../utils/format';
import { mainMenuKeyboard, backKeyboard, taskKeyboard, settingsKeyboard, statusSelectionKeyboard } from './keyboards';
import { registerUser, getUserSettings, setReminderMinutes, toggleReminders } from './reminders';
import { env } from '../config/env';

// Session data
interface SessionData {
  messageIds?: number[]; // Track messages to delete
  inboxPage?: number;
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
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    
    for (const id of ids) {
      try {
        await ctx.api.deleteMessage(chatId, id);
      } catch (error: any) {
        // Ignore "message not found" errors
        if (error?.description?.includes('message to delete not found')) {
          // Message already deleted, continue
        }
      }
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
    ctx.session.messageIds = [];
    ctx.session.inboxPage = 0;
    
    // Register user for reminders
    if (ctx.chat?.id) {
      registerUser(ctx.chat.id);
    }
    
    // Get user name
    const firstName = ctx.from?.first_name || 'друг';
    
    const msg = await ctx.reply(
      `Привет, ${firstName}\n\nПросто добавь задачу текстом или голосом.`,
      { reply_markup: mainMenuKeyboard() }
    );
    trackMessage(ctx, msg.message_id);
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


  // Inbox
  bot.callbackQuery('inbox', async (ctx) => {
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

  // Set status for newly created task
  bot.callbackQuery(/^set_status:(.+):(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    const statusName = ctx.match[2];
    
    const ok = await tasksRepo.setStatus(taskId, statusName, true);
    
    if (ok) {
      await ctx.answerCallbackQuery('Готово');
      
      // Clear all previous messages when task goes to work
      await clearMessages(ctx);
      
      const msg = await ctx.reply(
        `Задача добавлена.\nСтатус: ${escapeHtml(statusName)}`,
        { parse_mode: 'HTML', reply_markup: taskKeyboard(taskId, { showMenu: true }) }
      );
      trackMessage(ctx, msg.message_id);
    } else {
      await ctx.answerCallbackQuery('Ошибка');
      await ctx.editMessageText(
        `Ошибка. Попробуй ещё раз.`,
        { reply_markup: mainMenuKeyboard() }
      );
    }
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

  // --- Voice messages ---
  bot.on('message:voice', async (ctx) => {
    const voice = ctx.message.voice;
    
    // Try to get transcription if available
    let text = '';
    
    // Check if transcription exists in the message (Telegram Premium or bot-requested)
    const message = ctx.message as any;
    if (message.voice_transcription?.text) {
      text = message.voice_transcription.text;
    }
    
    // If no transcription, create task with placeholder
    if (!text) {
      text = '[Голосовое сообщение]';
    }
    
    // Clear all previous bot messages before creating new task
    await clearMessages(ctx);
    
    // Create task in inbox (automatically goes to inbox status)
    // User message stays
    const task = await tasksRepo.create({ name: text });
    
    if (task) {
      // Get file URL from Telegram and add to Notion
      if (voice?.file_id) {
        try {
          // Get file info from Telegram
          const file = await ctx.api.getFile(voice.file_id);
          // Construct direct download URL
          const fileUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
          
          // Add voice file to Notion task
          await tasksRepo.addFileToTask(task.id, fileUrl, 'voice.ogg');
        } catch (error) {
          console.error('Error adding voice file to Notion:', error);
        }
      }
      
      const msg = await ctx.reply(
        `Задача добавлена в Входящие.`,
        { reply_markup: taskKeyboard(task.id, { showMenu: true, hideSetDoing: true }) }
      );
      trackMessage(ctx, msg.message_id);
    } else {
      await ctx.reply(
        `Ошибка. Попробуй ещё раз.`,
        { reply_markup: mainMenuKeyboard() }
      );
    }
  });

  // --- Text messages ---
  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text;
    
    // Skip commands
    if (text.startsWith('/')) {
      return;
    }
    
    // Clear all previous bot messages before creating new task
    await clearMessages(ctx);
    
    // Also try to delete the message user is replying to (if any)
    // This handles the case when user creates new task while status selection message is still visible
    try {
      if (ctx.message?.reply_to_message) {
        await ctx.api.deleteMessage(ctx.chat!.id, ctx.message.reply_to_message.message_id);
      }
    } catch {}
    
    // Create task immediately (user message stays)
    const task = await tasksRepo.create({ name: text });
    
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
      const msg = await ctx.reply(
        `Ошибка. Попробуй ещё раз.`,
        { reply_markup: mainMenuKeyboard() }
      );
      trackMessage(ctx, msg.message_id);
    }
  });

  // Error handler
  bot.catch((err) => {
    console.error('Bot error:', err);
  });
}
