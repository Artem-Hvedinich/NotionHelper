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
