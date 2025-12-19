import 'dotenv/config';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`❌ Missing required env: ${name}`);
    process.exit(1);
  }
  return value;
}

export const env = {
  TELEGRAM_BOT_TOKEN: requireEnv('TELEGRAM_BOT_TOKEN'),
  NOTION_TOKEN: requireEnv('NOTION_TOKEN'),
  TASKS_DB_ID: requireEnv('TASKS_DB_ID'),
};

