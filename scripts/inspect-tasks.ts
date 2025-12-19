#!/usr/bin/env ts-node

/**
 * Скрипт для проверки структуры базы Tasks
 * Запуск: npm run inspect:tasks
 */

import 'dotenv/config';
import { inspectTasksDatabase } from '../src/utils/databaseInspector';

inspectTasksDatabase().then(() => {
  process.exit(0);
}).catch((error) => {
  console.error('Ошибка:', error);
  process.exit(1);
});

