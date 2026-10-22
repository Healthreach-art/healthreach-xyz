import {sqliteTable,text} from 'drizzle-orm/sqlite-core';
export const workspaces=sqliteTable('workspaces',{id:text('id').primaryKey(),data:text('data').notNull(),updated:text('updated').notNull()});
