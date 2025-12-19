import { Bot, session, SessionFlavor, Context } from 'grammy';
import { env } from './config/env';
import { setupBot } from './bot/handlers';
import { startReminderScheduler } from './bot/reminders';

// Session data
interface SessionData {
  waitingForTaskText?: boolean;
}

type MyContext = Context & SessionFlavor<SessionData>;

// Create bot
const bot = new Bot<MyContext>(env.TELEGRAM_BOT_TOKEN);

// Setup handlers
setupBot(bot as any);

// Start reminder scheduler
startReminderScheduler(bot as any);

// Start
console.log('Starting bot...');
bot.start({
  onStart: async () => {
    console.log('Bot is running');
    // Set commands menu after bot starts
    await bot.api.setMyCommands([
      { command: 'start', description: 'Начать' },
      { command: 'help', description: 'Помощь' },
      { command: 'settings', description: 'Настройки' },
    ]);
  },
});
