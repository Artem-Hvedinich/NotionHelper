import { Client as NotionClient } from '@notionhq/client';
import { NotionDatabaseKey, getDatabaseByKey, DATABASES } from '../config/databases';

if (!process.env.NOTION_API_KEY) {
  console.error('❌ Missing NOTION_API_KEY in .env');
  process.exit(1);
}

const notion = new NotionClient({ auth: process.env.NOTION_API_KEY });

// Кэш для схем баз данных (чтобы не запрашивать каждый раз)
interface CachedSchema {
    checkboxProperties: { propertyName: string; label: string }[];
    timestamp: number;
}

const schemaCache = new Map<string, CachedSchema>();
const CACHE_TTL = 5 * 60 * 1000; // 5 минут

/**
 * Динамически получает список чекбокс-полей из базы данных Notion.
 * Использует кэш для оптимизации.
 * Сохраняет порядок колонок из Notion.
 */
export async function getDatabaseCheckboxProperties(databaseId: string, useCache: boolean = true): Promise<{ propertyName: string; label: string }[]> {
    // Проверяем кэш
    if (useCache) {
        const cached = schemaCache.get(databaseId);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            return cached.checkboxProperties;
        }
    }

    try {
        const response = await notion.databases.retrieve({ database_id: databaseId });
        
        // Получаем порядок свойств из реальной страницы базы данных
        // Для этого делаем query и берем порядок из первой страницы
        const queryResponse = await notion.databases.query({
            database_id: databaseId,
            page_size: 1
        });
        
        // Если есть страницы, используем порядок свойств из первой страницы
        let propertyOrder: string[] = [];
        if (queryResponse.results.length > 0) {
            const firstPage = queryResponse.results[0] as any;
            if ('properties' in firstPage) {
                // Порядок свойств в объекте страницы соответствует порядку в UI
                propertyOrder = Object.keys(firstPage.properties);
            }
        }
        
        // Если не удалось получить порядок из страницы, используем порядок из схемы
        if (propertyOrder.length === 0) {
            propertyOrder = Object.keys(response.properties);
        }
        
        const checkboxProps: { propertyName: string; label: string }[] = [];
        
        // Проходим по порядку свойств
        for (const propKey of propertyOrder) {
            const prop = response.properties[propKey];
            // @ts-ignore
            if (prop && prop.type === 'checkbox') {
                checkboxProps.push({
                    propertyName: prop.name,
                    label: prop.name
                });
            }
        }
        
        // Если порядок не удалось получить, используем fallback
        if (checkboxProps.length === 0) {
            const allCheckboxes = Object.entries(response.properties)
                // @ts-ignore
                .filter(([_, prop]: [string, any]) => prop.type === 'checkbox')
                .map(([_, prop]: [string, any]) => ({
                    propertyName: prop.name,
                    label: prop.name
                }));
            checkboxProps.push(...allCheckboxes);
        }

        // Сохраняем в кэш
        schemaCache.set(databaseId, {
            checkboxProperties: checkboxProps,
            timestamp: Date.now()
        });

        return checkboxProps;
    } catch (error: any) {
        console.error('Error fetching database schema:', error);
        // Если ошибка, возвращаем пустой массив или можно выбросить ошибку
        throw new Error(`Не удалось получить схему базы данных: ${error.message}`);
    }
}

/**
 * Получает динамический список задач для утренней рутины из базы данных.
 */
export async function getMorningRoutineTasksDynamic(): Promise<{ propertyName: string; label: string }[]> {
    const dbConfig = DATABASES.morningRoutine;
    if (!dbConfig.id) {
        throw new Error('ID базы morningRoutine не настроен');
    }
    return await getDatabaseCheckboxProperties(dbConfig.id);
}

/**
 * Получает динамический список задач для дневной рутины из базы данных.
 */
export async function getDayRoutineTasksDynamic(): Promise<{ propertyName: string; label: string }[]> {
    const dbConfig = DATABASES.dayRoutine;
    if (!dbConfig.id) {
        throw new Error('ID базы dayRoutine не настроен');
    }
    return await getDatabaseCheckboxProperties(dbConfig.id);
}

export async function createPageInDatabase(params: {
  databaseKey: NotionDatabaseKey;
  text: string;
}): Promise<void> {
  const { databaseKey, text } = params;
  const dbConfig = getDatabaseByKey(databaseKey);
  
  // Основные свойства
  const titlePropName = dbConfig.propName || 'Name'; // По умолчанию Name
  const properties: Record<string, any> = {};

  // Свойство заголовка
  if (databaseKey === 'habits') {
      // Для Привычек используется "Название"
      properties['Название'] = {
          title: [{ text: { content: text } }],
      };
  } else {
      // Для остальных используется "Name" (или из конфига)
      properties[titlePropName] = {
          title: [{ text: { content: text } }],
      };
  }

  // Специфичная логика для каждого типа базы
  switch (databaseKey) {
    case 'dailyPlan':
      // "Дневной план": Date = Сегодня
      properties['Дата'] = {
        date: {
          start: new Date().toISOString().split('T')[0], // YYYY-MM-DD
        },
      };
      break;

    case 'morningRoutine':
      // Для утренней рутины устанавливаем дату, если запись создается через этот метод
      break;
      
    case 'dayRoutine':
    case 'eveningRoutine':
    case 'habits':
       break;
  }

  await notion.pages.create({
    parent: { database_id: dbConfig.id },
    properties: properties,
  });
}

export async function listTodayDailyPlan(): Promise<string> {
  const dbConfig = DATABASES.dailyPlan;
  
  if (!dbConfig.id) {
      return '❌ ID базы Дневного плана не настроен.';
  }

  const today = new Date().toISOString().split('T')[0];

  try {
    const response = await notion.databases.query({
      database_id: dbConfig.id,
      filter: {
        property: 'Дата',
        date: {
          equals: today,
        },
      },
      sorts: [
        {
           timestamp: 'created_time',
           direction: 'ascending'
        }
      ]
    });

    if (response.results.length === 0) {
      return '📅 План на сегодня пуст.';
    }

    const tasks = response.results.map((page: any) => {
      // Предполагаем, что "Name" - это свойство заголовка
      const title = page.properties['Name']?.title?.[0]?.plain_text || 'Без названия';
      const window = page.properties['Окно']?.select?.name || '';
      
      return `${window ? `[${window}] ` : ''}${title}`;
    });

    return `📅 План на сегодня:\n\n${tasks.map((t: string) => `• ${t}`).join('\n')}`;

  } catch (error: any) {
    console.error('Error fetching daily plan:', error);
    return `❌ Ошибка при получении плана: ${error.message}`;
  }
}

/**
 * Проверяет, существует ли запись утренней рутины на сегодня.
 * Если нет — создает её.
 * Возвращает ID страницы.
 */
export async function ensureTodayMorningRow(): Promise<string> {
    const dbConfig = DATABASES.morningRoutine;
    if (!dbConfig.id) {
        throw new Error('ID базы morningRoutine не настроен');
    }

    const today = new Date().toISOString().split('T')[0];
    const titleProp = dbConfig.propName || 'Name';

    // 1. Ищем существующую запись
    const response = await notion.databases.query({
        database_id: dbConfig.id,
        filter: {
            property: '📅 Дата',
            date: {
                equals: today
            }
        }
    });

    if (response.results.length > 0) {
        return response.results[0].id;
    }

    // 2. Если не найдено, создаем новую
    const newPage = await notion.pages.create({
        parent: { database_id: dbConfig.id },
        properties: {
            [titleProp]: {
                title: [
                    {
                        text: {
                            content: `Утро ${today}`
                        }
                    }
                ]
            },
            '📅 Дата': {
                date: {
                    start: today
                }
            }
        }
    });

    return newPage.id;
}

/**
 * Находит поле даты в базе данных динамически.
 * Ищет поле типа 'date' с названиями, содержащими "Дата", "Date" или эмодзи календаря.
 */
async function findDateProperty(databaseId: string): Promise<string | null> {
    try {
        const response = await notion.databases.retrieve({ database_id: databaseId });
        
        for (const [propName, prop] of Object.entries(response.properties)) {
            // @ts-ignore
            if (prop.type === 'date') {
                // Проверяем, содержит ли название поле даты
                const nameLower = propName.toLowerCase();
                if (nameLower.includes('дата') || nameLower.includes('date') || propName.includes('📅') || propName.includes('🗓️')) {
                    return propName;
                }
            }
        }
        
        // Если не нашли по названию, возвращаем первое поле типа date
        for (const [propName, prop] of Object.entries(response.properties)) {
            // @ts-ignore
            if (prop.type === 'date') {
                return propName;
            }
        }
        
        return null;
    } catch (error: any) {
        console.error('Error finding date property:', error);
        return null;
    }
}

/**
 * Проверяет, существует ли запись дневной рутины на сегодня.
 * Если нет — создает её.
 * Возвращает ID страницы.
 */
export async function ensureTodayDayRow(): Promise<string> {
    const dbConfig = DATABASES.dayRoutine;
    if (!dbConfig.id) {
        throw new Error('ID базы dayRoutine не настроен');
    }

    const today = new Date().toISOString().split('T')[0];
    const titleProp = dbConfig.propName || 'Name';

    // Находим поле даты динамически
    const datePropertyName = await findDateProperty(dbConfig.id);

    // 1. Ищем существующую запись (только если есть поле даты)
    if (datePropertyName) {
        try {
            const response = await notion.databases.query({
                database_id: dbConfig.id,
                filter: {
                    property: datePropertyName,
                    date: {
                        equals: today
                    }
                }
            });

            if (response.results.length > 0) {
                return response.results[0].id;
            }
        } catch (error: any) {
            console.error('Error querying by date:', error);
            // Продолжаем создание новой записи, если фильтрация по дате не удалась
        }
    }

    // 2. Если не найдено, создаем новую
    const properties: Record<string, any> = {
        [titleProp]: {
            title: [
                {
                    text: {
                        content: `День ${today}`
                    }
                }
            ]
        }
    };

    // Добавляем поле даты только если оно найдено
    if (datePropertyName) {
        properties[datePropertyName] = {
            date: {
                start: today
            }
        };
    }

    const newPage = await notion.pages.create({
        parent: { database_id: dbConfig.id },
        properties: properties
    });

    return newPage.id;
}

/**
 * Получает текущий статус утренней рутины (чекбоксы).
 * Использует динамический список задач из базы данных.
 */
export async function getMorningStatus(pageId: string, tasks?: { propertyName: string; label: string }[]): Promise<Record<string, boolean>> {
  const page = await notion.pages.retrieve({ page_id: pageId });
  const result: Record<string, boolean> = {};

  if (!('properties' in page)) {
      throw new Error('Не удалось получить свойства страницы');
  }

  // Если передан список задач, используем его, иначе берем все чекбоксы из страницы
  if (tasks) {
      tasks.forEach(task => {
          const prop = page.properties[task.propertyName];
          // @ts-ignore
          result[task.propertyName] = prop?.checkbox || false;
      });
  } else {
      // Fallback: берем все чекбоксы из страницы
      Object.values(page.properties).forEach((prop: any) => {
          if (prop.type === 'checkbox') {
              result[prop.name] = prop.checkbox;
          }
      });
  }

  return result;
}

/**
 * Получает текущий статус дневной рутины (чекбоксы).
 * Использует динамический список задач из базы данных.
 */
export async function getDayStatus(pageId: string, tasks?: { propertyName: string; label: string }[]): Promise<Record<string, boolean>> {
  const page = await notion.pages.retrieve({ page_id: pageId });
  const result: Record<string, boolean> = {};

  if (!('properties' in page)) {
      throw new Error('Не удалось получить свойства страницы');
  }

  // Если передан список задач, используем его, иначе берем все чекбоксы из страницы
  if (tasks) {
      tasks.forEach(task => {
          const prop = page.properties[task.propertyName];
          // @ts-ignore
          result[task.propertyName] = prop?.checkbox || false;
      });
  } else {
      // Fallback: берем все чекбоксы из страницы
      Object.values(page.properties).forEach((prop: any) => {
          if (prop.type === 'checkbox') {
              result[prop.name] = prop.checkbox;
          }
      });
  }

  return result;
}

/**
 * Получает статистику утренней рутины (Выполнение % и Оценка).
 * Динамически находит поля по типу и названию.
 */
export async function getMorningStats(pageId: string): Promise<{ completion: number | string; score: string }> {
    const page = await notion.pages.retrieve({ page_id: pageId });
    if (!('properties' in page)) {
        return { completion: 0, score: '?' };
    }

    let completion = 0;
    let score = 'Нет оценки';

    // Динамически ищем поле "Выполнение %" или похожее
    // Ищем свойства типа formula или rollup, которые содержат в названии "Выполнение" или "Completion"
    for (const [propName, prop] of Object.entries(page.properties)) {
        // @ts-ignore
        const propType = prop?.type;
        
        // Ищем поле с процентом выполнения
        if ((propName.includes('Выполнение') || propName.includes('Completion') || propName.includes('📊')) 
            && (propType === 'formula' || propType === 'rollup')) {
            // @ts-ignore
            if (propType === 'formula') {
                // @ts-ignore
                completion = prop.formula?.number || prop.formula?.string || 0;
            } else if (propType === 'rollup') {
                // @ts-ignore
                completion = prop.rollup?.number || prop.rollup?.array?.[0]?.number || 0;
            }
        }
        
        // Ищем поле с оценкой
        if ((propName.includes('Оценка') || propName.includes('Rating') || propName.includes('Score') || propName.includes('🌟'))
            && (propType === 'formula' || propType === 'select' || propType === 'rollup')) {
            // @ts-ignore
            if (propType === 'formula') {
                // @ts-ignore
                score = prop.formula?.string || prop.formula?.number?.toString() || 'Нет оценки';
            } else if (propType === 'select') {
                // @ts-ignore
                score = prop.select?.name || 'Нет оценки';
            } else if (propType === 'rollup') {
                // @ts-ignore
                score = prop.rollup?.array?.[0]?.text?.content || prop.rollup?.string || 'Нет оценки';
            }
        }
    }

    return { completion, score };
}

/**
 * Получает все не-чекбокс свойства страницы в порядке их расположения в Notion.
 */
export async function getPageNonCheckboxProperties(pageId: string): Promise<Array<{ name: string; value: string; type: string }>> {
    const page = await notion.pages.retrieve({ page_id: pageId });
    if (!('properties' in page)) {
        return [];
    }

    const result: Array<{ name: string; value: string; type: string }> = [];
    
    // Получаем порядок свойств из объекта страницы
    const propertyOrder = Object.keys(page.properties);
    
    for (const propKey of propertyOrder) {
        const prop = page.properties[propKey];
        // @ts-ignore
        const propType = prop?.type;
        
        // Пропускаем чекбоксы
        if (propType === 'checkbox') {
            continue;
        }
        
        // Пропускаем title (заголовок)
        if (propType === 'title') {
            continue;
        }
        
        // Пропускаем date (дата)
        if (propType === 'date') {
            continue;
        }
        
        let value = '';
        
        // @ts-ignore
        switch (propType) {
            case 'formula':
                // @ts-ignore
                if (prop.formula?.type === 'number') {
                    // @ts-ignore
                    const numValue = prop.formula.number;
                    if (numValue !== null && numValue !== undefined) {
                        // Если число > 1, это проценты, иначе доля
                        value = numValue > 1 ? `${Math.round(numValue)}%` : `${Math.round(numValue * 100)}%`;
                    }
                } else if (prop.formula?.type === 'string') {
                    // @ts-ignore
                    value = prop.formula.string || '';
                } else {
                    // @ts-ignore
                    value = String(prop.formula?.number || prop.formula?.string || '');
                }
                break;
                
            case 'rollup':
                // @ts-ignore
                if (prop.rollup?.type === 'number') {
                    // @ts-ignore
                    const numValue = prop.rollup.number;
                    if (numValue !== null && numValue !== undefined) {
                        value = numValue > 1 ? `${Math.round(numValue)}%` : `${Math.round(numValue * 100)}%`;
                    }
                } else if (prop.rollup?.type === 'array') {
                    // @ts-ignore
                    const firstItem = prop.rollup.array?.[0];
                    if (firstItem) {
                        // @ts-ignore
                        if (firstItem.type === 'text' || firstItem.text) {
                            // @ts-ignore
                            value = firstItem.text?.content || '';
                        } else {
                            // @ts-ignore
                            value = String(firstItem?.number || firstItem?.text?.content || '');
                        }
                    }
                } else {
                    // @ts-ignore
                    value = String(prop.rollup?.number || prop.rollup?.string || '');
                }
                break;
                
            case 'select':
                // @ts-ignore
                value = prop.select?.name || '';
                break;
                
            case 'rich_text':
                // @ts-ignore
                value = prop.rich_text?.[0]?.plain_text || '';
                break;
                
            case 'number':
                // @ts-ignore
                const numValue = prop.number;
                if (numValue !== null && numValue !== undefined) {
                    value = numValue > 1 ? `${Math.round(numValue)}%` : `${Math.round(numValue * 100)}%`;
                }
                break;
                
            default:
                // @ts-ignore
                value = String(prop[propType] || '');
        }
        
        if (value) {
            // @ts-ignore - prop.name существует для всех типов свойств
            const propName = prop.name || propKey;
            result.push({
                name: propName,
                value: value,
                type: propType
            });
        }
    }
    
    return result;
}

/**
 * Отмечает чекбокс задачи в утренней рутине.
 */
export async function updateMorningTask(pageId: string, propertyName: string, value: boolean): Promise<void> {
  await notion.pages.update({
      page_id: pageId,
      properties: {
          [propertyName]: {
              checkbox: value
          }
      }
  });
}

/**
 * Отмечает чекбокс задачи в дневной рутине.
 */
export async function updateDayTask(pageId: string, propertyName: string, value: boolean): Promise<void> {
  await notion.pages.update({
      page_id: pageId,
      properties: {
          [propertyName]: {
              checkbox: value
          }
      }
  });
}

/**
 * Находит поле заголовка (title) в базе данных динамически.
 * Ищет поле типа 'title'.
 */
async function findTitleProperty(databaseId: string): Promise<string | null> {
    try {
        const response = await notion.databases.retrieve({ database_id: databaseId });
        
        for (const [propName, prop] of Object.entries(response.properties)) {
            // @ts-ignore
            if (prop.type === 'title') {
                return propName;
            }
        }
        
        return null;
    } catch (error: any) {
        console.error('Error finding title property:', error);
        return null;
    }
}

/**
 * Находит поле статуса в базе данных динамически.
 * Ищет поле типа 'select' с названиями, содержащими "Статус", "Status" или эмодзи статуса.
 */
async function findStatusProperty(databaseId: string): Promise<string | null> {
    try {
        const response = await notion.databases.retrieve({ database_id: databaseId });
        
        for (const [propName, prop] of Object.entries(response.properties)) {
            // @ts-ignore
            if (prop.type === 'select' || prop.type === 'status') {
                // Проверяем, содержит ли название поле статуса
                const nameLower = propName.toLowerCase();
                if (nameLower.includes('статус') || nameLower.includes('status') || propName.includes('🔄') || propName.includes('⌚')) {
                    return propName;
                }
            }
        }
        
        // Если не нашли по названию, возвращаем первое поле типа select или status
        for (const [propName, prop] of Object.entries(response.properties)) {
            // @ts-ignore
            if (prop.type === 'select' || prop.type === 'status') {
                return propName;
            }
        }
        
        return null;
    } catch (error: any) {
        console.error('Error finding status property:', error);
        return null;
    }
}

/**
 * Получает все возможные статусы из базы данных дневной рутины.
 */
export async function getDayRoutineStatuses(): Promise<string[]> {
    const dbConfig = DATABASES.dayRoutine;
    if (!dbConfig.id) {
        throw new Error('ID базы dayRoutine не настроен');
    }

    const statusPropertyName = await findStatusProperty(dbConfig.id);
    if (!statusPropertyName) {
        throw new Error('Не найдено поле статуса в базе данных дневной рутины');
    }

    try {
        const response = await notion.databases.retrieve({ database_id: dbConfig.id });
        const statusProp = response.properties[statusPropertyName];
        
        // @ts-ignore
        if (statusProp.type === 'select') {
            // @ts-ignore
            return statusProp.select.options.map((opt: any) => opt.name);
        } else if (statusProp.type === 'status') {
            // @ts-ignore
            return statusProp.status.options.map((opt: any) => opt.name);
        }
        
        return [];
    } catch (error: any) {
        console.error('Error fetching statuses:', error);
        throw new Error(`Не удалось получить статусы: ${error.message}`);
    }
}

/**
 * Интерфейс для задачи дневной рутины.
 */
export interface DayRoutineTask {
    pageId: string;
    title: string;
    status: string;
    lastEditedTime: string;
}

/**
 * Получает задачи дневной рутины по статусу.
 * Если статус "Готово" (или похожий), фильтрует по Last edited time = сегодня.
 * Возвращает массив задач с полной информацией.
 */
export async function getDayRoutineTasksByStatus(status: string): Promise<DayRoutineTask[]> {
    const dbConfig = DATABASES.dayRoutine;
    if (!dbConfig.id) {
        throw new Error('ID базы dayRoutine не настроен');
    }

    const statusPropertyName = await findStatusProperty(dbConfig.id);
    if (!statusPropertyName) {
        throw new Error('Не найдено поле статуса в базе данных дневной рутины');
    }

    // Получаем схему базы данных для определения типа поля статуса
    const dbSchema = await notion.databases.retrieve({ database_id: dbConfig.id });
    const statusProp = dbSchema.properties[statusPropertyName];
    // @ts-ignore
    const statusPropType = statusProp?.type;

    const today = new Date().toISOString().split('T')[0];
    const todayStart = new Date(today + 'T00:00:00.000Z').toISOString();
    const todayEnd = new Date(today + 'T23:59:59.999Z').toISOString();

    try {
        // Проверяем, является ли статус "Готово" (или похожим)
        const statusLower = status.toLowerCase();
        const isDoneStatus = statusLower.includes('готово') || statusLower.includes('done') || statusLower.includes('завершено') || statusLower.includes('completed');

        // Строим фильтр
        let filter: any;

        // Если статус "Готово", добавляем фильтр по дате редактирования
        if (isDoneStatus) {
            filter = {
                and: [
                    {
                        property: statusPropertyName,
                        [statusPropType === 'select' ? 'select' : 'status']: { equals: status }
                    },
                    {
                        timestamp: 'last_edited_time',
                        last_edited_time: {
                            on_or_after: todayStart,
                            on_or_before: todayEnd
                        }
                    }
                ]
            };
        } else {
            filter = {
                property: statusPropertyName,
                [statusPropType === 'select' ? 'select' : 'status']: { equals: status }
            };
        }

        const response = await notion.databases.query({
            database_id: dbConfig.id,
            filter: filter,
            sorts: [
                {
                    timestamp: 'last_edited_time',
                    direction: 'descending'
                }
            ]
        });

        if (response.results.length === 0) {
            return [];
        }

        // Динамически находим поле заголовка
        const titlePropName = await findTitleProperty(dbConfig.id);
        if (!titlePropName) {
            // Fallback: используем propName из конфига или 'Name'
            const fallbackTitleProp = dbConfig.propName || 'Name';
            console.warn(`Не найдено поле title в базе данных, используем fallback: ${fallbackTitleProp}`);
        }
        
        const titleProp = titlePropName || dbConfig.propName || 'Name';
        
        const tasks: DayRoutineTask[] = response.results.map((page: any) => {
            // Пробуем получить заголовок из поля title
            const titleProperty = page.properties[titleProp];
            let title = 'Без названия';
            
            if (titleProperty) {
                // @ts-ignore
                if (titleProperty.type === 'title' && titleProperty.title) {
                    // @ts-ignore
                    title = titleProperty.title[0]?.plain_text || 'Без названия';
                } else {
                    // Если это не title, пробуем найти title поле динамически
                    for (const [propKey, prop] of Object.entries(page.properties)) {
                        // @ts-ignore
                        if (prop.type === 'title' && prop.title) {
                            // @ts-ignore
                            title = prop.title[0]?.plain_text || 'Без названия';
                            break;
                        }
                    }
                }
            } else {
                // Если свойство не найдено, ищем title поле динамически
                for (const [propKey, prop] of Object.entries(page.properties)) {
                    // @ts-ignore
                    if (prop.type === 'title' && prop.title) {
                        // @ts-ignore
                        title = prop.title[0]?.plain_text || 'Без названия';
                        break;
                    }
                }
            }
            
            return {
                pageId: page.id,
                title: title,
                status: status,
                lastEditedTime: page.last_edited_time || ''
            };
        });

        return tasks;

    } catch (error: any) {
        console.error('Error fetching tasks by status:', error);
        throw new Error(`Не удалось получить задачи: ${error.message}`);
    }
}

/**
 * Обновляет статус задачи в дневной рутине.
 */
export async function updateDayRoutineTaskStatus(pageId: string, newStatus: string): Promise<void> {
    const dbConfig = DATABASES.dayRoutine;
    if (!dbConfig.id) {
        throw new Error('ID базы dayRoutine не настроен');
    }

    const statusPropertyName = await findStatusProperty(dbConfig.id);
    if (!statusPropertyName) {
        throw new Error('Не найдено поле статуса в базе данных дневной рутины');
    }

    // Получаем схему базы данных для определения типа поля статуса
    const dbSchema = await notion.databases.retrieve({ database_id: dbConfig.id });
    const statusProp = dbSchema.properties[statusPropertyName];
    // @ts-ignore
    const statusPropType = statusProp?.type;

    try {
        const updateProperties: Record<string, any> = {};
        
        if (statusPropType === 'select') {
            updateProperties[statusPropertyName] = {
                select: { name: newStatus }
            };
        } else if (statusPropType === 'status') {
            updateProperties[statusPropertyName] = {
                status: { name: newStatus }
            };
        } else {
            throw new Error(`Неподдерживаемый тип поля статуса: ${statusPropType}`);
        }

        await notion.pages.update({
            page_id: pageId,
            properties: updateProperties
        });
    } catch (error: any) {
        console.error('Error updating task status:', error);
        throw new Error(`Не удалось обновить статус задачи: ${error.message}`);
    }
}

/**
 * Получает полную информацию о задаче дневной рутины по ID страницы.
 */
export async function getDayRoutineTaskInfo(pageId: string): Promise<DayRoutineTask> {
    try {
        const page = await notion.pages.retrieve({ page_id: pageId });
        
        if (!('properties' in page)) {
            throw new Error('Не удалось получить свойства страницы');
        }

        const dbConfig = DATABASES.dayRoutine;
        const titlePropName = await findTitleProperty(dbConfig.id);
        const titleProp = titlePropName || dbConfig.propName || 'Name';
        
        const statusPropertyName = await findStatusProperty(dbConfig.id);
        if (!statusPropertyName) {
            throw new Error('Не найдено поле статуса');
        }

        // Получаем заголовок
        let title = 'Без названия';
        const titleProperty = page.properties[titleProp];
        if (titleProperty) {
            // @ts-ignore
            if (titleProperty.type === 'title' && titleProperty.title) {
                // @ts-ignore
                title = titleProperty.title[0]?.plain_text || 'Без названия';
            }
        }

        // Получаем статус
        let status = '';
        const statusProperty = page.properties[statusPropertyName];
        if (statusProperty) {
            // @ts-ignore
            if (statusProperty.type === 'select' && statusProperty.select) {
                // @ts-ignore
                status = statusProperty.select.name || '';
            } else if (statusProperty.type === 'status' && statusProperty.status) {
                // @ts-ignore
                status = statusProperty.status.name || '';
            }
        }

        return {
            pageId: page.id,
            title: title,
            status: status,
            lastEditedTime: page.last_edited_time || ''
        };
    } catch (error: any) {
        console.error('Error fetching task info:', error);
        throw new Error(`Не удалось получить информацию о задаче: ${error.message}`);
    }
}
