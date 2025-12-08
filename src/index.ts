import 'dotenv/config';
import { Telegraf } from 'telegraf';
import { NotionDatabaseKey } from './config/databases';
import { commandHandlers } from './handlers/commands';
import { actionHandlers } from './handlers/actions';
import { messageHandlers } from './handlers/messages';

// --- Конфигурация ---

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error('❌ Отсутствует TELEGRAM_BOT_TOKEN в .env');
  process.exit(1);
}

// --- Инициализация ---

const bot = new Telegraf(BOT_TOKEN);

// --- Регистрация обработчиков команд ---

bot.command('start', (ctx) => commandHandlers.handleStart(ctx));
bot.command('menu', (ctx) => commandHandlers.handleMenu(ctx));
bot.command(['mode', 'db', 'choose'], (ctx) => commandHandlers.handleDatabaseSelection(ctx));
bot.command('morning', (ctx) => commandHandlers.handleMorning(ctx));
bot.command('morning_status', (ctx) => commandHandlers.handleMorningStatus(ctx));
bot.command('day', (ctx) => commandHandlers.handleDay(ctx));
bot.command('day_status', (ctx) => commandHandlers.handleDayStatus(ctx));

// --- Регистрация обработчиков действий (callback queries) ---

// Обработка выбора базы данных
bot.action(/^db:(.+)$/, async (ctx) => {
  const dbKey = ctx.match[1] as NotionDatabaseKey;
  await actionHandlers.handleDatabaseSelection(ctx, dbKey);
});

// Обработка конкретных действий (создать/список)
bot.action(/^action:(create|list):(.+)$/, async (ctx) => {
  const type = ctx.match[1] as 'create' | 'list';
  const dbKey = ctx.match[2] as NotionDatabaseKey;
  await actionHandlers.handleAction(ctx, type, dbKey);
});

// Обработка утренних чекбоксов
bot.action(/^morning_task:(.+)$/, async (ctx) => {
  const propName = ctx.match[1];
  await actionHandlers.handleMorningTask(ctx, propName);
});

// Обработка дневных чекбоксов
bot.action(/^day_task:(.+)$/, async (ctx) => {
  const propName = ctx.match[1];
  await actionHandlers.handleDayTask(ctx, propName);
});

// Обработка выбора статуса дневной рутины
bot.action(/^day_status:(.+)$/, async (ctx) => {
  const status = ctx.match[1];
  await actionHandlers.handleDayStatusSelection(ctx, status);
});

// --- Регистрация обработчиков сообщений ---

bot.on('text', (ctx) => messageHandlers.handleText(ctx));

// --- Запуск ---

bot.launch().then(() => {
  console.log('🤖 Бот запущен...');
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
