import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
export const syncRecords = sqliteTable('sync_records', {
  owner: text('owner').notNull(),
  key: text('record_key').notNull(),
  payload: text('payload').notNull(),
  revision: integer('revision').notNull(),
  lastOp: text('last_op').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, table => [primaryKey({columns:[table.owner,table.key]})]);
export const syncAccounts = sqliteTable('sync_accounts', {
  owner: text('owner').primaryKey(),
  generation: integer('generation').notNull().default(1),
  deleted: integer('deleted').notNull().default(0),
});
