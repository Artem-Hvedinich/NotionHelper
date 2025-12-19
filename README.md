# Notion Tasks Bot

Минималистичный Telegram бот для управления задачами в Notion.

## Возможности

- `/add` — добавить задачу (wizard: название → дедлайн → приоритет)
- `/inbox` — входящие задачи
- `/today` — задачи на сегодня
- `/week` — задачи на неделю
- `/done <id>` — отметить выполненной
- `/undone <id>` — вернуть в работу
- `/del <id>` — удалить
- `/open <id>` — открыть в Notion
- `/sync` — проверить связь с Notion

## Настройка

### 1. Telegram Bot Token

1. Открой [@BotFather](https://t.me/BotFather)
2. Создай бота: `/newbot`
3. Скопируй токен

### 2. Notion Integration

1. Открой [Notion Integrations](https://www.notion.so/my-integrations)
2. Создай новую интеграцию
3. Скопируй Internal Integration Token

### 3. Notion Database

1. Создай базу данных Tasks в Notion
2. Добавь интеграцию к базе (Share → Invite → выбери интеграцию)
3. Скопируй ID базы из URL: `https://notion.so/workspace/DATABASE_ID?v=...`

### 4. Структура базы

Рекомендуемые свойства (названия можно изменить в `src/config/notion.ts`):

| Свойство | Тип | Значения |
|----------|-----|----------|
| Name | Title | — |
| Status | Select | Inbox, Next, Doing, Done |
| Due | Date | — |
| Priority | Select | Low, Med, High |

### 5. Environment

Создай `.env`:

```env
TELEGRAM_BOT_TOKEN=your_bot_token
NOTION_TOKEN=your_notion_token
TASKS_DB_ID=your_database_id
```

## Запуск

```bash
# Установить зависимости
npm install

# Разработка
npm run dev

# Сборка
npm run build

# Продакшен
npm start
```

## Структура проекта

```
src/
├── config/
│   ├── env.ts        # Переменные окружения
│   └── notion.ts     # Конфиг Notion (названия свойств)
├── notion/
│   ├── client.ts     # Notion API client
│   ├── repository.ts # CRUD операции
│   └── types.ts      # Типы
├── bot/
│   ├── handlers.ts   # Обработчики команд
│   └── keyboards.ts  # Inline клавиатуры
├── utils/
│   └── format.ts     # Форматирование
└── index.ts          # Точка входа
```

## Лицензия

ISC
