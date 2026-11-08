import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { withTestDb } from '../../test/harness';
import { organisationMemberships, organisations, users } from '../../db/schema/identity';
import { accountingPeriodEvents } from '../../db/schema/accounting-periods';
import { closeAccountingPeriodForUser } from './period-lock';
import { AccountDeletionService } from '../auth/account-deletion.service';

describe('retained close audit actors', () => {
 it('allows an accountant to delete their account while preserving another company’s immutable audit', async () => withTestDb(async ({db}) => {
  const organisationId=crypto.randomUUID(), ownerId=crypto.randomUUID(), actorId=crypto.randomUUID();
  await db.insert(users).values([{id:ownerId,name:'Owner',email:'owner@example.com'},{id:actorId,name:'Accountant',email:'staff@example.com'}]);
  await db.insert(organisations).values({id:organisationId,name:'Retained company'});
  await db.insert(organisationMemberships).values([{organisationId,userId:ownerId,role:'owner'},{organisationId,userId:actorId,role:'accountant'}]);
  await closeAccountingPeriodForUser(db,actorId,{through:'2026-10-31',reason:'October reconciled and reviewed',reviewed:true,expectedRevision:0});
  const before=await db.select().from(accountingPeriodEvents);
  const deletion=new AccountDeletionService({hooks:[],purgeOrganisation:async()=>{throw new Error('Other owner company must not be purged');}});
  await expect(deletion.delete(db,{id:actorId,name:'Accountant',email:'staff@example.com'})).resolves.toMatchObject({deleted:true});
  expect(await db.select().from(users).where(eq(users.id,actorId))).toEqual([]);
  expect(await db.select().from(accountingPeriodEvents)).toEqual(before);
  expect(before[0].actorId).toBe(actorId);
  expect(await db.select().from(organisations).where(eq(organisations.id,organisationId))).toHaveLength(1);
 }));
});

it('migrates existing0035 audit and financial rows unchanged while retaining company and revision constraints', () => {
 const sql=new DatabaseSync(':memory:');
 try {
  sql.exec('PRAGMA foreign_keys=ON');
  const directory=new URL('../../../sqlite-migrations/',import.meta.url);
  for(const name of readdirSync(directory).filter(n=>n.endsWith('.sql')).sort()) {
   if(name.startsWith('0036_')) break;
   sql.exec(readFileSync(new URL(name,directory),'utf8'));
  }
  sql.exec("INSERT INTO organisations(id,name) VALUES ('org','Company'); INSERT INTO users(id,name,email) VALUES ('actor','Accountant','staff@example.test'); INSERT INTO customers(id,organisation_id,user_id,name,email) VALUES ('customer','org','actor','Customer','customer@example.test'); INSERT INTO invoices(id,organisation_id,user_id,invoice_number,customer_id,date,due_date,subtotal,tax_amount,total) VALUES ('invoice','org','actor','INV1','customer','2026-10-01','2026-10-21','100','15','115'); INSERT INTO accounting_period_locks(organisation_id,closed_through,revision) VALUES ('org','2026-10-31',1); INSERT INTO accounting_period_events(id,organisation_id,actor_id,action,new_closed_through,reason,revision,created_at) VALUES ('event','org','actor','close','2026-10-31','Reviewed October close',1,123456789)");
  const before={events:sql.prepare('SELECT * FROM accounting_period_events').all(),locks:sql.prepare('SELECT * FROM accounting_period_locks').all(),invoices:sql.prepare('SELECT * FROM invoices').all()};
  sql.exec(readFileSync(new URL('0036_accounting-period-retained-actor.sql',directory),'utf8'));
  expect(sql.prepare('SELECT * FROM accounting_period_events').all()).toEqual(before.events);
  expect(sql.prepare('SELECT * FROM accounting_period_locks').all()).toEqual(before.locks);
  expect(sql.prepare('SELECT * FROM invoices').all()).toEqual(before.invoices);
  expect(sql.prepare('PRAGMA foreign_key_list(accounting_period_events)').all().map(row=>(row as {table:string}).table)).toEqual(['organisations']);
  expect(()=>sql.exec("INSERT INTO accounting_period_events(id,organisation_id,actor_id,action,reason,revision) VALUES ('duplicate','org','actor','close','Duplicate revision',1)")).toThrow();
  expect(()=>sql.exec("INSERT INTO accounting_period_events(id,organisation_id,actor_id,action,reason,revision) VALUES ('other','missing','actor','close','Other company',2)")).toThrow();
  expect(sql.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
 } finally {sql.close();}
});
