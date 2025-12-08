# Telegram Bot for Notion

Telegram бот для управления задачами в Notion базах данных.

## Локальная разработка

1. Установите зависимости:
```bash
npm install
```

2. Создайте файл `.env` в корне проекта:
```env
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
NOTION_API_KEY=your_notion_api_key
NOTION_DB_MORNING_ROUTINE_ID=your_morning_routine_db_id
NOTION_DB_DAY_ROUTINE_ID=your_day_routine_db_id
NOTION_DB_EVENING_ROUTINE_ID=your_evening_routine_db_id
NOTION_DB_HABITS_ID=your_habits_db_id
NOTION_DB_DAILY_PLAN_ID=your_daily_plan_db_id
NOTION_DB_LATER_TASKS_ID=your_later_tasks_db_id
```

3. Запустите бота:
```bash
npm start
```

## Деплой на Render.com

### Шаг 1: Подготовка репозитория

Убедитесь, что все изменения закоммичены и отправлены в GitHub:
```bash
git add .
git commit -m "Prepare for Render deployment"
git push
```

### Шаг 2: Создание сервиса на Render

**Вариант 1: Использование render.yaml (рекомендуется)**

1. Зайдите на [render.com](https://render.com) и войдите в аккаунт
2. Нажмите "New +" → "Blueprint"
3. Подключите ваш GitHub репозиторий
4. Render автоматически обнаружит файл `render.yaml` и создаст Background Worker

**Вариант 2: Ручная настройка**

1. Зайдите на [render.com](https://render.com) и войдите в аккаунт
2. Нажмите "New +" → "Background Worker" (важно: не Web Service!)
3. Подключите ваш GitHub репозиторий
4. Заполните настройки:
   - **Name**: `telegram-notion-bot` (или любое другое имя)
   - **Environment**: `Node`
   - **Region**: выберите ближайший регион
   - **Branch**: `main`
   - **Root Directory**: оставьте пустым
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm run serve`

### Шаг 3: Настройка переменных окружения

В разделе "Environment" добавьте следующие переменные:

- `NODE_ENV` = `production`
- `TELEGRAM_BOT_TOKEN` = ваш токен Telegram бота
- `NOTION_API_KEY` = ваш API ключ Notion
- `NOTION_DB_MORNING_ROUTINE_ID` = ID базы данных утренней рутины
- `NOTION_DB_DAY_ROUTINE_ID` = ID базы данных дневных задач
- `NOTION_DB_EVENING_ROUTINE_ID` = ID базы данных вечерней рутины
- `NOTION_DB_HABITS_ID` = ID базы данных привычек
- `NOTION_DB_DAILY_PLAN_ID` = ID базы данных дневного плана
- `NOTION_DB_LATER_TASKS_ID` = ID базы данных "Позже"

### Шаг 4: Деплой

1. Нажмите "Apply" (для Blueprint) или "Create Background Worker" (для ручной настройки)
2. Render автоматически начнет сборку и деплой
3. Дождитесь завершения деплоя (обычно 2-3 минуты)
4. Проверьте логи в разделе "Logs" на наличие ошибок

### Шаг 5: Проверка работы

После успешного деплоя:
1. Откройте Telegram и найдите вашего бота
2. Отправьте команду `/start`
3. Проверьте, что бот отвечает корректно

## Структура проекта

```
├── src/
│   ├── config/          # Конфигурация баз данных
│   ├── handlers/        # Обработчики команд и действий
│   ├── keyboards/       # Генерация клавиатур
│   ├── services/        # Сервисы (Notion, UserState)
│   ├── types/           # TypeScript типы
│   └── index.ts         # Точка входа
├── dist/                # Скомпилированный JavaScript (генерируется)
├── package.json
├── tsconfig.json
└── render.yaml          # Конфигурация для Render.com
```

## Команды

- `npm start` - запуск в режиме разработки (с ts-node)
- `npm run build` - компиляция TypeScript в JavaScript
- `npm run serve` - запуск скомпилированного кода (для production)

## Поддержание инстанса активным (для Free плана)

На Render.com бесплатный план может "засыпать" после 15 минут бездействия. Бот включает HTTP сервер на эндпоинтах `/health` и `/ping`, которые можно использовать для поддержания инстанса активным.

### Вариант 1: Использование Uptime-сервиса (рекомендуется)

Настройте один из бесплатных сервисов для пинга:

1. **UptimeRobot** (https://uptimerobot.com):
   - Создайте аккаунт
   - Добавьте новый монитор типа "HTTP(s)"
   - URL: `https://your-app-name.onrender.com/health`
   - Interval: 5 минут (или меньше)

2. **Cron-Job.org** (https://cron-job.org):
   - Создайте аккаунт
   - Добавьте новую задачу
   - URL: `https://your-app-name.onrender.com/ping`
   - Schedule: каждые 10 минут

3. **Koyeb** (https://koyeb.com) или другие сервисы

### Вариант 2: Использование GitHub Actions

В проекте уже есть готовый workflow файл `.github/workflows/ping-render.yml`.

1. После деплоя на Render, скопируйте URL вашего приложения (например: `https://telegram-notion-bot.onrender.com`)
2. В настройках GitHub репозитория:
   - Перейдите в Settings → Secrets and variables → Actions
   - Нажмите "New repository secret"
   - Name: `RENDER_URL`
   - Value: `https://your-app-name.onrender.com` (ваш URL)
   - Нажмите "Add secret"
3. Workflow будет автоматически запускаться каждые 10 минут

**Примечание:** GitHub Actions бесплатен для публичных репозиториев, для приватных есть лимит 2000 минут в месяц.

## Примечания

- Бот использует **polling** для получения обновлений от Telegram
- HTTP сервер автоматически запускается на порту из переменной окружения `PORT` (предоставляется Render)
- Эндпоинты `/health` и `/ping` возвращают статус бота

