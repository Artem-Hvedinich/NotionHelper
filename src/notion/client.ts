import { Client } from '@notionhq/client';
import { env } from '../config/env';

export const notion = new Client({
  auth: env.NOTION_TOKEN,
});

