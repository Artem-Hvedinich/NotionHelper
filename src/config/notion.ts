/**
 * Notion database property names
 * Adjust these to match your database structure
 */
export const PROPS = {
  NAME: 'Name',
  STATUS: 'Status',
  DUE: 'Due',
  PRIORITY: 'Priority',
  AREA: 'Area',
} as const;

/**
 * Status values (adjust to your database)
 */
export const STATUS = {
  INBOX: 'Inbox',
  NEXT: 'Next',
  DOING: 'Doing',
  DONE: 'Done',
} as const;

/**
 * Priority values
 */
export const PRIORITY = {
  LOW: 'Low',
  MED: 'Med',
  HIGH: 'High',
} as const;
