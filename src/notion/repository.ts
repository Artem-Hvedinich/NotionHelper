import { notion } from './client';
import { env } from '../config/env';
import { PROPS } from '../config/notion';
import { Task, CreateTaskInput } from './types';

/**
 * Database schema cache
 */
interface SchemaCache {
  titleProp: string;
  statusProp?: string;
  statusType?: 'select' | 'status'; // Тип свойства статуса
  dateProp?: string;
  doneStatuses: string[];  // Статусы "готово"
  inboxStatuses: string[]; // Статусы "входящие"
  doingStatuses: string[]; // Статусы "в работе"
  archiveStatuses: string[]; // Статусы "архив"
  allStatuses: string[]; // Все статусы из базы
}

/**
 * Tasks Repository - CRUD operations for Notion Tasks database
 */
export class TasksRepository {
  private dbId = env.TASKS_DB_ID;
  private schema: SchemaCache | null = null;

  /**
   * Clear schema cache (useful when statuses are changed in Notion)
   */
  clearSchemaCache(): void {
    this.schema = null;
  }

  /**
   * Load database schema and detect properties
   */
  private async loadSchema(forceReload = false): Promise<SchemaCache> {
    if (this.schema && !forceReload) return this.schema;

    const schema: SchemaCache = {
      titleProp: PROPS.NAME,
      doneStatuses: [],
      inboxStatuses: [],
      doingStatuses: [],
      archiveStatuses: [],
      allStatuses: [],
    };

    try {
      const db = await notion.databases.retrieve({ database_id: this.dbId });
      
      for (const [key, prop] of Object.entries(db.properties)) {
        const p = prop as any;
        
        // Title property
        if (p.type === 'title') {
          schema.titleProp = key;
          console.log(`📋 Title: "${key}"`);
        }
        
        // Status property (select or status type)
        if (p.type === 'select' || p.type === 'status') {
          const keyLower = key.toLowerCase();
          if (keyLower.includes('status') || keyLower.includes('статус')) {
            schema.statusProp = key;
            schema.statusType = p.type; // Сохраняем тип
            console.log(`📋 Status: "${key}" (${p.type})`);
            
            // Analyze status options
            const options = p.select?.options || p.status?.options || [];
            for (const opt of options) {
              const name = opt.name;
              const nameLower = name.toLowerCase();
              
              // Save all statuses
              schema.allStatuses.push(name);
              
              // For status type, use group to determine category
              if (p.type === 'status' && opt.group) {
                const group = opt.group.toLowerCase();
                
                // Check if it's archive first (archive can be in complete group)
                if (
                  nameLower.includes('archive') ||
                  nameLower.includes('архив')
                ) {
                  schema.archiveStatuses.push(name);
                  console.log(`   📦 Archive status: "${name}" (group: ${opt.group})`);
                } else if (group === 'complete' || group === 'done') {
                  schema.doneStatuses.push(name);
                  console.log(`   ✅ Done status: "${name}" (group: ${opt.group})`);
                } else if (group === 'in-progress' || group === 'inprogress' || group === 'in progress') {
                  schema.doingStatuses.push(name);
                  console.log(`   🔄 Doing status: "${name}" (group: ${opt.group})`);
                } else if (group === 'to-do' || group === 'todo' || group === 'to do') {
                  schema.inboxStatuses.push(name);
                  console.log(`   📥 Inbox status: "${name}" (group: ${opt.group})`);
                } else {
                  // Fallback: use name-based detection for unknown groups
                  if (
                    nameLower.includes('done') ||
                    nameLower.includes('готово') ||
                    nameLower.includes('выполнен') ||
                    nameLower.includes('завершен') ||
                    nameLower.includes('complete')
                  ) {
                    schema.doneStatuses.push(name);
                    console.log(`   ✅ Done status: "${name}" (fallback)`);
                  } else if (
                    nameLower.includes('archive') ||
                    nameLower.includes('архив')
                  ) {
                    schema.archiveStatuses.push(name);
                    console.log(`   📦 Archive status: "${name}" (fallback)`);
                  } else if (
                    nameLower.includes('inbox') ||
                    nameLower.includes('входящ') ||
                    nameLower.includes('new') ||
                    nameLower.includes('новы') ||
                    nameLower.includes('todo') ||
                    nameLower.includes('backlog')
                  ) {
                    schema.inboxStatuses.push(name);
                    console.log(`   📥 Inbox status: "${name}" (fallback)`);
                  } else if (
                    nameLower.includes('doing') ||
                    nameLower.includes('работ') ||
                    nameLower.includes('progress') ||
                    nameLower.includes('next') ||
                    nameLower.includes('active')
                  ) {
                    schema.doingStatuses.push(name);
                    console.log(`   🔄 Doing status: "${name}" (fallback)`);
                  }
                }
              } else {
                // For select type or status without group, use name-based detection
                if (
                  nameLower.includes('done') ||
                  nameLower.includes('готово') ||
                  nameLower.includes('выполнен') ||
                  nameLower.includes('завершен') ||
                  nameLower.includes('complete')
                ) {
                  schema.doneStatuses.push(name);
                  console.log(`   ✅ Done status: "${name}"`);
                } else if (
                  nameLower.includes('archive') ||
                  nameLower.includes('архив')
                ) {
                  schema.archiveStatuses.push(name);
                  console.log(`   📦 Archive status: "${name}"`);
                } else if (
                  nameLower.includes('inbox') ||
                  nameLower.includes('входящ') ||
                  nameLower.includes('new') ||
                  nameLower.includes('новы') ||
                  nameLower.includes('todo') ||
                  nameLower.includes('backlog')
                ) {
                  schema.inboxStatuses.push(name);
                  console.log(`   📥 Inbox status: "${name}"`);
                } else if (
                  nameLower.includes('doing') ||
                  nameLower.includes('работ') ||
                  nameLower.includes('progress') ||
                  nameLower.includes('next') ||
                  nameLower.includes('active')
                ) {
                  schema.doingStatuses.push(name);
                  console.log(`   🔄 Doing status: "${name}"`);
                }
              }
            }
            
            // If no inbox found, use first non-done status
            if (schema.inboxStatuses.length === 0 && options.length > 0) {
              const firstNonDone = options.find((o: any) => 
                !schema.doneStatuses.includes(o.name)
              );
              if (firstNonDone) {
                schema.inboxStatuses.push(firstNonDone.name);
                console.log(`   📥 Inbox status (fallback): "${firstNonDone.name}"`);
              }
            }
          }
        }
        
        // Date property
        if (p.type === 'date') {
          const keyLower = key.toLowerCase();
          if (
            keyLower.includes('due') ||
            keyLower.includes('date') ||
            keyLower.includes('дата') ||
            keyLower.includes('срок') ||
            keyLower.includes('дедлайн')
          ) {
            schema.dateProp = key;
            console.log(`📋 Date: "${key}"`);
          }
        }
      }
    } catch (error) {
      console.error('Load schema error:', error);
    }

    this.schema = schema;
    return schema;
  }

  /**
   * Create a new task (goes to Inbox)
   */
  async create(input: CreateTaskInput): Promise<Task | null> {
    try {
      const schema = await this.loadSchema();
      
      const properties: Record<string, any> = {
        [schema.titleProp]: {
          title: [{ text: { content: input.name } }],
        },
      };

      // Set status to first inbox status
      if (schema.statusProp && schema.inboxStatuses.length > 0) {
        if (schema.statusType === 'status') {
          properties[schema.statusProp] = { 
            status: { name: schema.inboxStatuses[0] } 
          };
        } else {
          properties[schema.statusProp] = { 
            select: { name: schema.inboxStatuses[0] } 
          };
        }
      }

      // Set date if provided
      if (input.due && schema.dateProp) {
        properties[schema.dateProp] = { date: { start: input.due } };
      }

      const page = await notion.pages.create({
        parent: { database_id: this.dbId },
        properties,
      });

      return this.mapPage(page);
    } catch (error) {
      console.error('Create task error:', error);
      return null;
    }
  }

  /**
   * Add file/audio to a task page
   */
  async addFileToTask(taskId: string, fileUrl: string, fileName?: string): Promise<boolean> {
    try {
      await notion.blocks.children.append({
        block_id: taskId,
        children: [
          {
            object: 'block',
            type: 'audio',
            audio: {
              type: 'external',
              external: {
                url: fileUrl,
              },
            },
          },
        ],
      });
      return true;
    } catch (error) {
      console.error('Add file to task error:', error);
      return false;
    }
  }

  /**
   * Get task by ID
   */
  async getById(id: string): Promise<Task | null> {
    try {
      const page = await notion.pages.retrieve({ page_id: id });
      return this.mapPage(page);
    } catch {
      return null;
    }
  }

  /**
   * List inbox tasks (with inbox status)
   */
  async listInbox(limit = 5): Promise<Task[]> {
    try {
      const schema = await this.loadSchema();
      
      let filter: any = undefined;
      
      // Filter by inbox statuses
      if (schema.statusProp && schema.inboxStatuses.length > 0) {
        const statusFilterType = schema.statusType === 'status' ? 'status' : 'select';
        if (schema.inboxStatuses.length === 1) {
          filter = {
            property: schema.statusProp,
            [statusFilterType]: { equals: schema.inboxStatuses[0] }
          };
        } else {
          filter = {
            or: schema.inboxStatuses.map(status => ({
              property: schema.statusProp,
              [statusFilterType]: { equals: status }
            }))
          };
        }
      }

      const response = await notion.databases.query({
        database_id: this.dbId,
        filter,
        page_size: limit,
        sorts: [{ timestamp: 'created_time', direction: 'descending' }],
      });
      
      return Promise.all(response.results.map((p) => this.mapPage(p)));
    } catch (error) {
      console.error('List inbox error:', error);
      return [];
    }
  }

  /**
   * List tasks due today (not done)
   */
  async listToday(): Promise<Task[]> {
    try {
      const schema = await this.loadSchema();
      
      if (!schema.dateProp) {
        console.warn('No date property found');
        return [];
      }

      const today = new Date().toISOString().split('T')[0];
      
      let filter: any = {
        property: schema.dateProp,
        date: { equals: today },
      };
      
      // Also exclude done statuses
      if (schema.statusProp && schema.doneStatuses.length > 0) {
        const statusFilterType = schema.statusType === 'status' ? 'status' : 'select';
        const notDoneFilters = schema.doneStatuses.map(status => ({
          property: schema.statusProp,
          [statusFilterType]: { does_not_equal: status }
        }));
        
        filter = {
          and: [
            filter,
            ...notDoneFilters
          ]
        };
      }

      const response = await notion.databases.query({
        database_id: this.dbId,
        filter,
        sorts: [{ timestamp: 'created_time', direction: 'descending' }],
      });
      
      return Promise.all(response.results.map((p) => this.mapPage(p)));
    } catch (error) {
      console.error('List today error:', error);
      return [];
    }
  }

  /**
   * List tasks with time in next N minutes (for reminders)
   */
  async listUpcoming(minutes: number): Promise<Task[]> {
    try {
      const schema = await this.loadSchema();
      
      if (!schema.dateProp) {
        return [];
      }

      const now = new Date();
      const future = new Date(now.getTime() + minutes * 60 * 1000);

      let filter: any = {
        and: [
          {
            property: schema.dateProp,
            date: { on_or_after: now.toISOString() },
          },
          {
            property: schema.dateProp,
            date: { on_or_before: future.toISOString() },
          },
        ],
      };

      // Exclude done statuses
      if (schema.statusProp && schema.doneStatuses.length > 0) {
        const statusFilterType = schema.statusType === 'status' ? 'status' : 'select';
        const notDoneFilters = schema.doneStatuses.map(status => ({
          property: schema.statusProp,
          [statusFilterType]: { does_not_equal: status }
        }));
        filter.and.push(...notDoneFilters);
      }

      const response = await notion.databases.query({
        database_id: this.dbId,
        filter,
        sorts: [{ timestamp: 'created_time', direction: 'ascending' }],
      });
      
      return Promise.all(response.results.map((p) => this.mapPage(p)));
    } catch (error) {
      console.error('List upcoming error:', error);
      return [];
    }
  }

  /**
   * Get all doing statuses (always fresh from Notion)
   * @deprecated Use getActiveStatuses() instead
   */
  async getDoingStatuses(): Promise<string[]> {
    const schema = await this.loadSchema(true); // Force reload to get latest statuses
    return schema.doingStatuses;
  }

  /**
   * Get all active statuses (excluding inbox, done, archive)
   * Universal function that returns all statuses except excluded ones
   */
  async getActiveStatuses(): Promise<string[]> {
    const schema = await this.loadSchema(true); // Force reload to get latest statuses
    
    // Combine all excluded statuses
    const excludedStatuses = [
      ...schema.doneStatuses,
      ...schema.inboxStatuses,
      ...schema.archiveStatuses,
    ];
    
    // Return all statuses except excluded ones
    return schema.allStatuses.filter(status => !excludedStatuses.includes(status));
  }

  /**
   * Set task to specific status
   */
  async setStatus(id: string, statusName: string, setDateToToday = false): Promise<boolean> {
    try {
      const schema = await this.loadSchema();
      
      if (!schema.statusProp) {
        console.warn('No status property found');
        return false;
      }

      const properties: Record<string, any> = {};

      // Set status
      if (schema.statusType === 'status') {
        properties[schema.statusProp] = { status: { name: statusName } };
      } else {
        properties[schema.statusProp] = { select: { name: statusName } };
      }

      // Set date to today if requested
      if (setDateToToday && schema.dateProp) {
        const today = new Date().toISOString().split('T')[0];
        properties[schema.dateProp] = { date: { start: today } };
      }

      await notion.pages.update({
        page_id: id,
        properties,
      });
      return true;
    } catch (error) {
      console.error('Set status error:', error);
      return false;
    }
  }

  /**
   * Set task to "doing" status and today's date
   */
  async setDoing(id: string): Promise<boolean> {
    try {
      const schema = await this.loadSchema();
      
      if (schema.doingStatuses.length === 0) {
        console.warn('No doing statuses found');
        return false;
      }

      return this.setStatus(id, schema.doingStatuses[0], true);
    } catch (error) {
      console.error('Set doing error:', error);
      return false;
    }
  }

  /**
   * Mark task as done
   */
  async setDone(id: string): Promise<boolean> {
    try {
      const schema = await this.loadSchema();
      
      if (!schema.statusProp || schema.doneStatuses.length === 0) {
        console.warn('No status property or done status found');
        return false;
      }

      const statusUpdate = schema.statusType === 'status' 
        ? { status: { name: schema.doneStatuses[0] } }
        : { select: { name: schema.doneStatuses[0] } };
      
      await notion.pages.update({
        page_id: id,
        properties: {
          [schema.statusProp]: statusUpdate,
        },
      });
      return true;
    } catch (error) {
      console.error('Set done error:', error);
      return false;
    }
  }

  // --- Private helpers ---

  private async mapPage(page: any): Promise<Task> {
    const props = page.properties || {};
    const schema = await this.loadSchema();

    return {
      id: page.id,
      name: this.getTitle(props[schema.titleProp]),
      status: schema.statusProp ? this.getSelect(props[schema.statusProp]) : undefined,
      due: schema.dateProp ? this.getDate(props[schema.dateProp]) : undefined,
      url: page.url,
    };
  }

  private getTitle(prop: any): string {
    return prop?.title?.[0]?.plain_text || 'Без названия';
  }

  private getSelect(prop: any): string | undefined {
    return prop?.select?.name || prop?.status?.name;
  }

  private getDate(prop: any): string | undefined {
    return prop?.date?.start;
  }
}

export const tasksRepo = new TasksRepository();
