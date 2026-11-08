import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { organisations } from './identity';
export const accountingPeriodLocks=sqliteTable('accounting_period_locks',{
 organisationId:text('organisation_id').primaryKey().references(()=>organisations.id),
 closedThrough:text('closed_through'),revision:integer('revision').notNull().default(0),
},t=>[check('accounting_period_locks_revision_check',sql`${t.revision} >= 0`)]);
export const accountingPeriodEvents=sqliteTable('accounting_period_events',{
 id:text('id').primaryKey().$defaultFn(()=>crypto.randomUUID()),organisationId:text('organisation_id').notNull().references(()=>organisations.id),
 // Immutable opaque actor reference survives account deletion; insertion uses the authenticated context.
 actorId:text('actor_id').notNull(),action:text('action').notNull(),previousClosedThrough:text('previous_closed_through'),newClosedThrough:text('new_closed_through'),
 reason:text('reason').notNull(),revision:integer('revision').notNull(),createdAt:integer('created_at',{mode:'timestamp_ms'}).notNull().default(sql`(unixepoch()*1000)`),
},t=>[uniqueIndex('accounting_period_events_org_revision_uidx').on(t.organisationId,t.revision),check('accounting_period_events_action_check',sql`${t.action} IN ('close','reopen')`)]);
