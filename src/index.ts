import 'dotenv/config';
import { Telegraf, Markup } from 'telegraf';
import { DATABASES, NotionDatabaseKey, NotionDatabaseConfig, getDatabaseByKey } from './config/databases';
import { createPageInDatabase, listTodayDailyPlan, ensureTodayMorningRow, getMorningStatus, updateMorningTask, getMorningStats, getMorningRoutineTasksDynamic, getPageNonCheckboxProperties } from './services/notion';

// --- Определения типов ---

// Состояние для конкретного потока взаимодействия (например, ожидание текста задачи)
interface UserModeState {
  mode: 'idle' | 'create';
  dbKey?: NotionDatabaseKey;
}

// --- Конфигурация ---

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error('❌ Отсутствует TELEGRAM_BOT_TOKEN в .env');
  process.exit(1);
}

// --- Инициализация ---

const bot = new Telegraf(BOT_TOKEN);

// Постоянный выбор (запомненная база данных)
const userDbSelection = new Map<number, NotionDatabaseKey>();

// Временное состояние режима (ожидание ввода)
const userMode = new Map<number, UserModeState>();

// Хранилище ID сообщений бота для каждого пользователя (для удаления при /start)
const userBotMessages = new Map<number, number[]>();

// --- Вспомогательные функции ---

export function setUserDatabase(userId: number, key: NotionDatabaseKey): void {
  userDbSelection.set(userId, key);
}

export function getUserDatabase(userId: number): NotionDatabaseKey | null {
  return userDbSelection.get(userId) || null;
}

function setUserMode(userId: number, mode: 'idle' | 'create', dbKey?: NotionDatabaseKey) {
  userMode.set(userId, { mode, dbKey });
}

function getUserMode(userId: number): UserModeState {
  return userMode.get(userId) || { mode: 'idle' };
}

/**
 * Сохраняет ID сообщения бота для последующего удаления.
 */
function trackBotMessage(userId: number, messageId: number): void {
  const currentMessages = userBotMessages.get(userId) || [];
  currentMessages.push(messageId);
  userBotMessages.set(userId, currentMessages);
}

// --- Клавиатуры ---

function getDatabaseKeyboard() {
  const buttons = (Object.keys(DATABASES) as NotionDatabaseKey[])
    .filter((key) => DATABASES[key].id !== '')
    .map((key) => {
      const config = DATABASES[key];
      return Markup.button.callback(config.buttonText, `db:${key}`);
    });

  return Markup.inlineKeyboard(buttons, { columns: 2 });
}

function getActionsKeyboard(dbKey: NotionDatabaseKey) {
  const config = DATABASES[dbKey];
  if (!config.actions) return undefined;

  const buttons = config.actions.map(action => 
    Markup.button.callback(action.buttonText, `action:${action.type}:${dbKey}`)
  );
  
  return Markup.inlineKeyboard(buttons, { columns: 1 });
}

/**
 * Динамически генерирует клавиатуру на основе актуальных свойств базы.
 */
async function getMorningRoutineKeyboard(status: Record<string, boolean> = {}) {
    // Получаем список задач динамически из Notion (только чекбоксы)
    const tasks = await getMorningRoutineTasksDynamic();
    
    const buttons = tasks.map(task => {
        const isDone = status[task.propertyName] || false;
        const icon = isDone ? '✅' : '⬜';
        
        return Markup.button.callback(
            `${icon} ${task.label}`, 
            `morning_task:${task.propertyName}` 
        );
    });
    return Markup.inlineKeyboard(buttons, { columns: 1 });
}


// --- Команды ---

bot.command('start', async (ctx) => {
  const userId = ctx.from.id;
  
  // Удаляем все предыдущие сообщения бота
  const messageIds = userBotMessages.get(userId);
  if (messageIds && messageIds.length > 0) {
    try {
      // Удаляем сообщения в обратном порядке (от новых к старым)
      for (const msgId of messageIds.reverse()) {
        try {
          await ctx.telegram.deleteMessage(ctx.chat.id, msgId);
        } catch (error: any) {
          // Игнорируем ошибки удаления (сообщение уже удалено или недоступно)
          if (!error.message?.includes('message to delete not found')) {
            console.error('Error deleting message:', error);
          }
        }
      }
    } catch (error: any) {
      console.error('Error deleting messages:', error);
    }
    // Очищаем список сообщений
    userBotMessages.set(userId, []);
  }
  
  // Отправляем новое сообщение
  const sentMessage = await ctx.reply(
    'Привет! 👋\n' +
    'Я бот для записи задач в Notion.\n\n' +
    'Сначала выбери базу данных, куда будем писать:',
    getDatabaseKeyboard()
  );
  
  // Сохраняем ID нового сообщения
  trackBotMessage(userId, sentMessage.message_id);
});

bot.command(['mode', 'db', 'choose'], async (ctx) => {
    const sentMessage = await ctx.reply('Выбери базу, с которой будем работать:', getDatabaseKeyboard());
    trackBotMessage(ctx.from.id, sentMessage.message_id);
});

bot.command('morning', async (ctx) => {
    try {
        const pageId = await ensureTodayMorningRow();
        const tasks = await getMorningRoutineTasksDynamic();
        const status = await getMorningStatus(pageId, tasks);
        const nonCheckboxProps = await getPageNonCheckboxProperties(pageId);
        const keyboard = await getMorningRoutineKeyboard(status);
        
        let message = '🌅 *Доброе утро!*\n\n';
        
        // Динамически выводим все не-чекбокс поля
        nonCheckboxProps.forEach(prop => {
            message += `${prop.name}: *${prop.value}*\n`;
        });
        
        if (nonCheckboxProps.length > 0) {
            message += '\n';
        }
        
        message += 'Что ты уже сделал из утренней рутины сегодня?';
        
        const sentMessage = await ctx.reply(message, { parse_mode: 'Markdown', ...keyboard });
        trackBotMessage(ctx.from.id, sentMessage.message_id);
    } catch (error: any) {
        console.error('Error fetching morning routine:', error);
        const errorMsg = await ctx.reply(`❌ Ошибка: ${error.message}`);
        trackBotMessage(ctx.from.id, errorMsg.message_id);
    }
});

bot.command('morning_status', async (ctx) => {
    try {
        const pageId = await ensureTodayMorningRow();
        const tasks = await getMorningRoutineTasksDynamic();
        const status = await getMorningStatus(pageId, tasks);
        const nonCheckboxProps = await getPageNonCheckboxProperties(pageId);
        
        let message = '🌅 *Утренняя рутина сегодня:*\n\n';
        tasks.forEach(task => {
            const isDone = status[task.propertyName];
            message += `${isDone ? '✅' : '⬜'} ${task.label}\n`;
        });

        // Динамически выводим все не-чекбокс поля
        if (nonCheckboxProps.length > 0) {
            message += '\n';
            nonCheckboxProps.forEach(prop => {
                message += `${prop.name}: *${prop.value}*\n`;
            });
        }
        
        const sentMessage = await ctx.reply(message, { parse_mode: 'Markdown' });
        trackBotMessage(ctx.from.id, sentMessage.message_id);
    } catch (error: any) {
        console.error('Error fetching morning status:', error);
        const errorMsg = await ctx.reply(`❌ Ошибка: ${error.message}`);
        trackBotMessage(ctx.from.id, errorMsg.message_id);
    }
});

// --- Действия (Actions) ---

// Обработка выбора базы данных
bot.action(/^db:(.+)$/, async (ctx) => {
  const dbKey = ctx.match[1] as NotionDatabaseKey;
  const dbConfig = getDatabaseByKey(dbKey);

  if (!dbConfig) {
    return ctx.answerCbQuery('❌ База данных не найдена.');
  }

  // Установка базы пользователя (запоминание)
  setUserDatabase(ctx.from!.id, dbKey);
  // Сброс режима в idle при переключении базы
  setUserMode(ctx.from!.id, 'idle');

  await ctx.answerCbQuery(`Выбрана база: ${dbConfig.title}`);
  
  // Для утренней рутины сразу показываем чеклист
  if (dbKey === 'morningRoutine') {
      try {
          const pageId = await ensureTodayMorningRow();
          const tasks = await getMorningRoutineTasksDynamic();
          const status = await getMorningStatus(pageId, tasks);
          const nonCheckboxProps = await getPageNonCheckboxProperties(pageId);
          const keyboard = await getMorningRoutineKeyboard(status);
          
          let message = '🌅 *Утренняя рутина*\n\n';
          
          // Динамически выводим все не-чекбокс поля
          nonCheckboxProps.forEach(prop => {
              message += `${prop.name}: *${prop.value}*\n`;
          });
          
          if (nonCheckboxProps.length > 0) {
              message += '\n';
          }
          
          message += 'Что ты уже сделал сегодня?';
          
          const editedMsg = await ctx.editMessageText(message, { 
              parse_mode: 'Markdown',
              ...keyboard 
          });
          // editMessageText редактирует существующее сообщение, ID уже должен быть в списке
          if (editedMsg && typeof editedMsg === 'object' && 'message_id' in editedMsg) {
              const msgId = (editedMsg as any).message_id;
              if (msgId) {
                  const currentMessages = userBotMessages.get(ctx.from!.id) || [];
                  if (!currentMessages.includes(msgId)) {
                      trackBotMessage(ctx.from!.id, msgId);
                  }
              }
          }
      } catch (error: any) {
          console.error('Error loading morning routine:', error);
          const errorMsg = await ctx.editMessageText(
              `❌ Ошибка при загрузке утренней рутины: ${error.message}`,
              { parse_mode: 'Markdown' }
          );
          // Если это новое сообщение об ошибке, отслеживаем его
          if (errorMsg && typeof errorMsg === 'object' && 'message_id' in errorMsg) {
              const msgId = (errorMsg as any).message_id;
              if (msgId) {
                  const currentMessages = userBotMessages.get(ctx.from!.id) || [];
                  if (!currentMessages.includes(msgId)) {
                      trackBotMessage(ctx.from!.id, msgId);
                  }
              }
          }
      }
  } else {
      // Для остальных баз показываем обычное меню действий
      const keyboard = getActionsKeyboard(dbKey);
      const editedMsg = await ctx.editMessageText(
          `✅ База изменена: *${dbConfig.title}*`,
          { 
              parse_mode: 'Markdown',
              ...keyboard 
          }
      );
      // editMessageText редактирует существующее сообщение
      if (editedMsg && typeof editedMsg === 'object' && 'message_id' in editedMsg) {
          const msgId = (editedMsg as any).message_id;
          if (msgId) {
              const currentMessages = userBotMessages.get(ctx.from!.id) || [];
              if (!currentMessages.includes(msgId)) {
                  trackBotMessage(ctx.from!.id, msgId);
              }
          }
      }
  }
});

// Обработка конкретных действий (создать/список)
bot.action(/^action:(create|list):(.+)$/, async (ctx) => {
  const type = ctx.match[1] as 'create' | 'list';
  const dbKey = ctx.match[2] as NotionDatabaseKey;
  const dbConfig = getDatabaseByKey(dbKey);
  
  if (!dbConfig) return ctx.answerCbQuery('Ошибка: база не найдена');

  if (type === 'create') {
    // Установка режима создания для пользователя
    setUserMode(ctx.from!.id, 'create', dbKey);
    
    await ctx.answerCbQuery();
    const sentMessage = await ctx.reply(
      `✍️ Напиши текст задачи, я сохраню её в базу «${dbConfig.title}»:`
    );
    trackBotMessage(ctx.from!.id, sentMessage.message_id);
  } else if (type === 'list') {
    if (dbKey === 'dailyPlan') {
        await ctx.answerCbQuery('Загружаю список...');
        const listText = await listTodayDailyPlan();
        const sentMessage = await ctx.reply(listText);
        trackBotMessage(ctx.from!.id, sentMessage.message_id);
    } else if (dbKey === 'morningRoutine') {
         // Для утренней рутины показываем кнопки
         try {
             const pageId = await ensureTodayMorningRow();
             const tasks = await getMorningRoutineTasksDynamic();
             const status = await getMorningStatus(pageId, tasks);
             const nonCheckboxProps = await getPageNonCheckboxProperties(pageId);
             const keyboard = await getMorningRoutineKeyboard(status);
             
             let message = '🌅 *Утренняя рутина*\n\n';
             
             // Динамически выводим все не-чекбокс поля
             nonCheckboxProps.forEach(prop => {
                 message += `${prop.name}: *${prop.value}*\n`;
             });
             
             if (nonCheckboxProps.length > 0) {
                 message += '\n';
             }
             
             message += 'Что ты уже сделал сегодня?';
             
             const sentMessage = await ctx.reply(message, { parse_mode: 'Markdown', ...keyboard });
             trackBotMessage(ctx.from!.id, sentMessage.message_id);
             await ctx.answerCbQuery();
         } catch (error: any) {
             await ctx.answerCbQuery('Ошибка загрузки');
             const errorMsg = await ctx.reply(`❌ Ошибка: ${error.message}`);
             trackBotMessage(ctx.from!.id, errorMsg.message_id);
         }
    } else {
        await ctx.answerCbQuery('Функция доступна только для Дневного плана');
        const sentMessage = await ctx.reply(`📋 Просмотр списка для «${dbConfig.title}» пока не реализован.`);
        trackBotMessage(ctx.from!.id, sentMessage.message_id);
    }
  }
});

// Обработка утренних чекбоксов
bot.action(/^morning_task:(.+)$/, async (ctx) => {
    const propName = ctx.match[1];
    try {
        const pageId = await ensureTodayMorningRow();
        const tasks = await getMorningRoutineTasksDynamic();
        const currentStatus = await getMorningStatus(pageId, tasks);
        const newValue = !currentStatus[propName];
        
        await updateMorningTask(pageId, propName, newValue);
        
        // Обновляем клавиатуру и статистику
        const newStatus = { ...currentStatus, [propName]: newValue };
        const nonCheckboxProps = await getPageNonCheckboxProperties(pageId);
        const keyboard = await getMorningRoutineKeyboard(newStatus);
        
        let message = '🌅 *Утренняя рутина*\n\n';
        
        // Динамически выводим все не-чекбокс поля
        nonCheckboxProps.forEach(prop => {
            message += `${prop.name}: *${prop.value}*\n`;
        });
        
        if (nonCheckboxProps.length > 0) {
            message += '\n';
        }
        
        message += 'Что ты уже сделал сегодня?';
        
        const editedMsg = await ctx.editMessageText(message, { 
            parse_mode: 'Markdown',
            ...keyboard 
        });
        
        // editMessageText возвращает обновленное сообщение, ID остается тем же
        if (editedMsg && typeof editedMsg === 'object' && 'message_id' in editedMsg) {
            const msgId = (editedMsg as any).message_id;
            if (msgId) {
                const currentMessages = userBotMessages.get(ctx.from!.id) || [];
                if (!currentMessages.includes(msgId)) {
                    trackBotMessage(ctx.from!.id, msgId);
                }
            }
        }
        
        const label = tasks.find(t => t.propertyName === propName)?.label || propName;
        await ctx.answerCbQuery(newValue ? `✅ ${label} выполнено!` : `⬜ ${label} отменено`);
        
    } catch (error: any) {
        console.error('Error updating morning task:', error);
        await ctx.answerCbQuery(`❌ Ошибка: ${error.message}`);
    }
});

// --- Обработка сообщений ---

bot.on('text', async (ctx) => {
  // Игнорируем команды
  if (ctx.message.text.startsWith('/')) return;

  const userId = ctx.from.id;
  const text = ctx.message.text;
  
  // 1. Проверка явного режима взаимодействия (пользователь нажал "Создать задачу")
  const state = getUserMode(userId);

  if (state.mode === 'create' && state.dbKey) {
      const dbConfig = getDatabaseByKey(state.dbKey);
      
      try {
          const response = await ctx.reply(`⏳ Сохраняю в *${dbConfig.title}*...`, { parse_mode: 'Markdown' });
          trackBotMessage(userId, response.message_id);
          
          await createPageInDatabase({ databaseKey: state.dbKey, text });

          await ctx.telegram.editMessageText(
              ctx.chat.id,
              response.message_id,
              undefined,
              `✅ Сохранил в базу «${dbConfig.title}».`,
              { parse_mode: 'Markdown' }
          );

          // Сброс режима в idle после успеха
          setUserMode(userId, 'idle');
      } catch (error: any) {
          console.error('Ошибка API Notion:', error);
          const errorMsg = await ctx.reply(`❌ Не удалось сохранить задачу. Попробуй позже.\nDebug: ${error.message || 'Unknown error'}`);
          trackBotMessage(userId, errorMsg.message_id);
      }
      return;
  }

  // 2. Fallback: Проверка запомненного выбора (Пользователь просто ввел текст без нажатия "Создать")
  // Если вы хотите отключить это и заставить нажимать кнопки, закомментируйте этот блок.
  // Но обычно это лучше для UX - оставить возможность быстрого добавления.
  const stickyKey = getUserDatabase(userId);
  if (state.mode === 'idle' && stickyKey) {
      const dbConfig = getDatabaseByKey(stickyKey);
      try {
          const response = await ctx.reply(`⏳ Сохраняю в *${dbConfig.title}*...`, { parse_mode: 'Markdown' });
          trackBotMessage(userId, response.message_id);
          await createPageInDatabase({ databaseKey: stickyKey, text });
          await ctx.telegram.editMessageText(
              ctx.chat.id,
              response.message_id,
              undefined,
              `✅ Сохранил в базу «${dbConfig.title}».`,
              { parse_mode: 'Markdown' }
          );
      } catch (error: any) {
          console.error('Ошибка API Notion:', error);
          const errorMsg = await ctx.reply(`❌ Не удалось сохранить задачу. Попробуй позже.\nDebug: ${error.message || 'Unknown error'}`);
          trackBotMessage(userId, errorMsg.message_id);
      }
      return;
  }

  // 3. Нет режима и нет выбора
  const sentMessage = await ctx.reply(
    '⚠️ Я не знаю, куда это сохранить.\nСначала выбери базу командой /db',
    getDatabaseKeyboard()
  );
  trackBotMessage(userId, sentMessage.message_id);
});

// --- Запуск ---

bot.launch().then(() => {
    console.log('🤖 Бот запущен...');
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
