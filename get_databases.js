require('dotenv').config();
const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_API_KEY });

async function listDatabases() {
  try {
    const response = await notion.search({
      filter: {
        value: 'database',
        property: 'object',
      },
    });

    if (response.results.length === 0) {
      console.log('❌ Бот не видит ни одной базы данных.');
      console.log('👉 Убедитесь, что вы добавили интеграцию в настройках нужной страницы Notion (три точки -> Connections -> Ваш бот).');
      return;
    }

    console.log(`✅ Найдено баз данных: ${response.results.length}\n`);

    response.results.forEach((db) => {
      console.log('--------------------------------------------------');
      console.log(`📂 Имя базы: ${db.title[0]?.plain_text || 'Без названия'}`);
      console.log(`🆔 ID: ${db.id}`);
      console.log('📋 Свойства (колонки):');
      
      const properties = db.properties;
      Object.keys(properties).forEach((propName) => {
        const prop = properties[propName];
        console.log(`   - "${propName}" (Тип: ${prop.type})`);
      });
      console.log('--------------------------------------------------\n');
    });

  } catch (error) {
    console.error('Ошибка:', error.message);
  }
}

listDatabases();

