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
bot.command('later', (ctx) => commandHandlers.handleLater(ctx));

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

// Обработка изменения статуса задачи дневной рутины (ds = day status)
bot.action(/^ds:(.+):(.+)$/, async (ctx) => {
  const shortId = ctx.match[1];
  const newStatus = ctx.match[2];
  await actionHandlers.handleDayTaskStatusChange(ctx, shortId, newStatus);
});

// Обработка удаления задачи дневной рутины (dd = day delete)
bot.action(/^dd:(.+)$/, async (ctx) => {
  const shortId = ctx.match[1];
  await actionHandlers.handleDayTaskDelete(ctx, shortId);
});

// Обработка переключения чекбокса задачи дневной рутины (dc = day checkbox)
bot.action(/^dc:(.+):(.+)$/, async (ctx) => {
  const shortId = ctx.match[1];
  const propertyName = ctx.match[2];
  await actionHandlers.handleDayTaskCheckboxToggle(ctx, shortId, propertyName);
});

// Обработка открытия задачи из списка (dt = day task)
bot.action(/^dt:(.+)$/, async (ctx) => {
  const shortId = ctx.match[1];
  await actionHandlers.handleDayTaskOpen(ctx, shortId);
});

// Обработка возврата к списку задач (dbl = day back list)
bot.action(/^dbl:(.+)$/, async (ctx) => {
  const shortId = ctx.match[1];
  await actionHandlers.handleDayBackToList(ctx, shortId);
});

// Обработка возврата к статусам
bot.action(/^day_back_statuses$/, async (ctx) => {
  await actionHandlers.handleDayBackToStatuses(ctx);
});

// Обработка добавления задачи в дневную рутину
bot.action(/^day_add_task$/, async (ctx) => {
  await actionHandlers.handleDayAddTask(ctx);
});

// Обработка редактирования поля задачи (de = day edit)
bot.action(/^de:(.+):(.+):(.+)$/, async (ctx) => {
  const shortId = ctx.match[1];
  const propertyName = ctx.match[2];
  const propertyType = ctx.match[3];
  await actionHandlers.handleDayTaskEditProperty(ctx, shortId, propertyName, propertyType);
});

// Обработка выбора значения для select/status поля (dp = day property)
bot.action(/^dp:(.+):(.+):(.+):(.+)$/, async (ctx) => {
  const shortId = ctx.match[1];
  const propertyName = ctx.match[2];
  const propertyType = ctx.match[3];
  const option = ctx.match[4];
  await actionHandlers.handleDayTaskPropertyOption(ctx, shortId, propertyName, propertyType, option);
});

// Обработка отмены редактирования поля (dcancel = day cancel)
bot.action(/^dcancel:(.+)$/, async (ctx) => {
  const shortId = ctx.match[1];
  await actionHandlers.handleDayTaskCancelEdit(ctx, shortId);
});

// Обработка выбора статуса "Позже"
bot.action(/^later_status:(.+)$/, async (ctx) => {
  const status = ctx.match[1];
  await actionHandlers.handleLaterStatusSelection(ctx, status);
});

// Обработка открытия задачи "Позже" из списка (lt = later task)
bot.action(/^lt:(.+)$/, async (ctx) => {
  const shortId = ctx.match[1];
  await actionHandlers.handleLaterTaskOpen(ctx, shortId);
});

// Обработка возврата к списку задач "Позже" (lbl = later back list)
bot.action(/^lbl:(.+)$/, async (ctx) => {
  const shortId = ctx.match[1];
  await actionHandlers.handleLaterBackToList(ctx, shortId);
});

// Обработка возврата к статусам "Позже"
bot.action(/^later_back_statuses$/, async (ctx) => {
  await actionHandlers.handleLaterBackToStatuses(ctx);
});

// Обработка добавления задачи в "Позже"
bot.action(/^later_add_task$/, async (ctx) => {
  await actionHandlers.handleLaterAddTask(ctx);
});

// Обработка изменения статуса задачи "Позже" (ls = later status)
bot.action(/^ls:(.+):(.+)$/, async (ctx) => {
  const shortId = ctx.match[1];
  const newStatus = ctx.match[2];
  await actionHandlers.handleLaterTaskStatusChange(ctx, shortId, newStatus);
});

// Обработка удаления задачи "Позже" (ld = later delete)
bot.action(/^ld:(.+)$/, async (ctx) => {
  const shortId = ctx.match[1];
  await actionHandlers.handleLaterTaskDelete(ctx, shortId);
});

// Обработка переключения чекбокса задачи "Позже" (lc = later checkbox)
bot.action(/^lc:(.+):(.+)$/, async (ctx) => {
  const shortId = ctx.match[1];
  const propertyName = ctx.match[2];
  await actionHandlers.handleLaterTaskCheckboxToggle(ctx, shortId, propertyName);
});

// Обработка редактирования поля задачи "Позже" (le = later edit)
bot.action(/^le:(.+):(.+):(.+)$/, async (ctx) => {
  const shortId = ctx.match[1];
  const propertyName = ctx.match[2];
  const propertyType = ctx.match[3];
  await actionHandlers.handleLaterTaskEditProperty(ctx, shortId, propertyName, propertyType);
});

// Обработка выбора значения для select/status поля "Позже" (lp = later property)
bot.action(/^lp:(.+):(.+):(.+):(.+)$/, async (ctx) => {
  const shortId = ctx.match[1];
  const propertyName = ctx.match[2];
  const propertyType = ctx.match[3];
  const option = ctx.match[4];
  await actionHandlers.handleLaterTaskPropertyOption(ctx, shortId, propertyName, propertyType, option);
});

// Обработка отмены редактирования поля "Позже" (lcancel = later cancel)
bot.action(/^lcancel:(.+)$/, async (ctx) => {
  const shortId = ctx.match[1];
  await actionHandlers.handleLaterTaskCancelEdit(ctx, shortId);
});

// --- Регистрация обработчиков сообщений ---

bot.on('text', (ctx) => messageHandlers.handleText(ctx));

// --- HTTP сервер для поддержания инстанса активным ---

import http from 'http';

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', bot: 'running' }));
  } else {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Telegram Bot is running');
  }
});

server.listen(PORT, () => {
  console.log(`🌐 HTTP сервер запущен на порту ${PORT}`);
});

// --- Запуск ---

bot.launch().then(() => {
  console.log('🤖 Бот запущен...');
});

// Enable graceful stop
process.once('SIGINT', () => {
  bot.stop('SIGINT');
  server.close();
});
process.once('SIGTERM', () => {
  bot.stop('SIGTERM');
  server.close();
});
