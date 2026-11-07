import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { withTestDb } from '../../test/harness';
import { users, organisations, organisationMemberships, activeOrganisationSelections } from '../../db/schema/identity';
import { bankFeedAccounts, bankFeedConnections, bankFeedTransactions } from '../../db/schema/bank-feeds';
import { createBankAccountForUser, importBankTransactionsForUser } from '../bank/bank.service';
import { bankAccounts, bankTransactions } from '../../db/schema/bank';
import { feedSummaryForUser, syncFeedsForUser, disconnectFeedsForUser, bankFeedPreDeleteHook, runDueBankFeeds, bankFeedConfigFromEnv } from './bank-feeds.service';
import { AkahuRevokedError, type BankFeedGateway } from './akahu.gateway';
const userId='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',organisationId='11111111-1111-1111-1111-111111111111';
const now=new Date('2026-11-01T01:00:00Z');
async function seed(db:Parameters<Parameters<typeof withTestDb>[0]>[0]['db']) {
 await db.insert(users).values({id:userId,name:'Owner',email:'owner@example.test'});
 await db.insert(organisations).values({id:organisationId,name:'Test company'});
 await db.insert(organisationMemberships).values({organisationId,userId,role:'owner'});
}
function gateway():BankFeedGateway {return {accounts:async()=>[{_id:'acc_test',name:'Operating',formatted_account:'12-3456',status:'ACTIVE',connection:{name:'Test bank'},balance:{currency:'NZD',current:'999.99'}}],transactions:async()=>[{_id:'tx_credit',date:'2026-10-02T00:00:00Z',description:'Income',amount:'1150.23'},{_id:'tx_debit',date:'2026-10-03T00:00:00Z',description:'Coffee',amount:'-0.10'}],revoke:async()=>{}};}
describe('Personal App bank feeds',()=>{
 it('does not report placeholders or an unscoped global token as a configured connection',()=>{
  expect(bankFeedConfigFromEnv({AKAHU_APP_ID:'app_your_app_id',AKAHU_USER_TOKEN:'token_your_token',AKAHU_ORGANISATION_ID:organisationId,AKAHU_USER_ID:userId})).toBeUndefined();
  expect(bankFeedConfigFromEnv({AKAHU_APP_ID:'app_1234567890abcdef',AKAHU_USER_TOKEN:'token_1234567890abcdef'})).toBeUndefined();
 });
 it('imports exact feed statements once, retains existing import duplicate detection, observes one-hour rest and hides provider tokens',async()=>withTestDb(async({db})=>{
  await seed(db);const config={organisationId,userId,gateway:gateway()};
  expect(await feedSummaryForUser(db,userId)).toMatchObject({mode:'unavailable',fullAppAvailable:false});
  const result=await syncFeedsForUser(db,userId,config,now);
  expect(result.imported).toBe(2);expect(result.summary.accounts).toHaveLength(1);
  const rows=await db.select().from(bankTransactions);expect(rows.map(x=>[x.amount,x.source])).toEqual([['1150.23','feed'],['0.10','feed']]);
  expect(JSON.stringify(result)).not.toContain('userToken');
  await expect(syncFeedsForUser(db,userId,config,new Date(now.getTime()+1000))).rejects.toMatchObject({status:429});
  expect((await syncFeedsForUser(db,userId,config,new Date(now.getTime()+3600001))).imported).toBe(0);
  expect(await db.select().from(bankTransactions)).toHaveLength(2);
 }));
 it('does not collapse genuine separate provider transactions with identical date, description and amount',async()=>withTestDb(async({db})=>{
  await seed(db);const provider=gateway();provider.transactions=async()=>[{_id:'tx_one',date:'2026-10-02T00:00:00Z',description:'Coffee',amount:'-5.00'},{_id:'tx_two',date:'2026-10-02T00:00:00Z',description:'Coffee',amount:'-5.00'}];
  const result=await syncFeedsForUser(db,userId,{organisationId,userId,gateway:provider},now);
  expect(result.imported).toBe(2);expect(await db.select().from(bankTransactions)).toHaveLength(2);
 }));
 it('revokes on401, prevents another org using Personal credentials, and disconnect retains accounting records',async()=>withTestDb(async({db})=>{
  await seed(db);const provider=gateway();const config={organisationId,userId,gateway:provider};
  await syncFeedsForUser(db,userId,config,now);
  provider.accounts=async()=>{throw new AkahuRevokedError();};
  await expect(syncFeedsForUser(db,userId,config,new Date(now.getTime()+3600001))).rejects.toThrow('revoked');
  expect((await feedSummaryForUser(db,userId,config)).status).toBe('revoked');
  await disconnectFeedsForUser(db,userId,config);expect((await feedSummaryForUser(db,userId,config)).status).toBe('disconnected');
  expect(await db.select().from(bankTransactions)).toHaveLength(2);
  await expect(syncFeedsForUser(db,userId,{...config,organisationId:'22222222-2222-2222-2222-222222222222'},now)).rejects.toMatchObject({status:403});
 }));
 it('revokes and purges connection metadata before account deletion, retaining imported accounting records',async()=>withTestDb(async({db})=>{
  await seed(db);const provider=gateway();let revoked=0;provider.revoke=async()=>{revoked++;};const config={organisationId,userId,gateway:provider};
  await syncFeedsForUser(db,userId,config,now);
  await bankFeedPreDeleteHook(db,config).onBeforeAccountDelete({userId,deletionKey:'test-delete'});
  expect(revoked).toBe(1);expect(await db.select().from(bankFeedConnections)).toHaveLength(0);expect(await db.select().from(bankFeedAccounts)).toHaveLength(0);expect(await db.select().from(bankFeedTransactions)).toHaveLength(0);
  expect(await db.select().from(bankTransactions)).toHaveLength(2);
 }));

 it('scheduled sync and deletion revoke the configured company even after its owner switches active company',async()=>withTestDb(async({db})=>{
  await seed(db);const provider=gateway();let reads=0,revokes=0;provider.accounts=async()=>{reads++;return [];};provider.revoke=async()=>{revokes++;};const config={organisationId,userId,gateway:provider};
  await syncFeedsForUser(db,userId,config,now);
  const other='22222222-2222-2222-2222-222222222222';await db.insert(organisations).values({id:other,name:'Other'});await db.insert(organisationMemberships).values({organisationId:other,userId,role:'owner'});await db.insert(activeOrganisationSelections).values({userId,organisationId:other});
  await runDueBankFeeds(db,config,new Date(now.getTime()+86400001));expect(reads).toBe(2);
  await bankFeedPreDeleteHook(db,config).onBeforeAccountDelete({userId,deletionKey:'delete-configured'});expect(revokes).toBe(1);expect(await db.select().from(bankFeedConnections)).toHaveLength(0);
 }));

 it('scheduled sync imports actual configured-company transactions after the owner selects another company',async()=>withTestDb(async({db})=>{
  await seed(db);const provider=gateway();const config={organisationId,userId,gateway:provider};
  const other='22222222-2222-2222-2222-222222222222';await db.insert(organisations).values({id:other,name:'Other'});await db.insert(organisationMemberships).values({organisationId:other,userId,role:'owner'});await db.insert(activeOrganisationSelections).values({userId,organisationId:other});
  await runDueBankFeeds(db,config,now);
  const rows=await db.select().from(bankTransactions);expect(rows).toHaveLength(2);expect(rows.every(row=>row.organisationId===organisationId)).toBe(true);
  const selections=await db.select().from(activeOrganisationSelections);expect(selections[0].organisationId).toBe(other);
 }));

 it('links an unambiguous existing bank account and skips a previously imported CSV statement row',async()=>withTestDb(async({db})=>{
  await seed(db);const account=await createBankAccountForUser(db,userId,{accountName:'Already imported',accountNumber:'12-3456',bankName:'Test bank',accountType:'checking',currency:'NZD'});
  await importBankTransactionsForUser(db,userId,{bankAccountId:account.id,skipDuplicates:true,transactions:[{transactionDate:'2026-10-02',description:'Income',amount:'1150.23',type:'credit'}]});
  const result=await syncFeedsForUser(db,userId,{organisationId,userId,gateway:gateway()},now);
  expect(result.imported).toBe(1);expect(result.duplicates).toBe(1);expect(await db.select().from(bankAccounts)).toHaveLength(1);expect(await db.select().from(bankTransactions)).toHaveLength(2);
 }));

 it('matches a legacy CSV row only once when distinct provider IDs share identical financial facts',async()=>withTestDb(async({db})=>{
  await seed(db);const account=await createBankAccountForUser(db,userId,{accountName:'CSV account',accountNumber:'12-3456',bankName:'Test bank',accountType:'checking',currency:'NZD'});
  await importBankTransactionsForUser(db,userId,{bankAccountId:account.id,skipDuplicates:true,transactions:[{transactionDate:'2026-10-02',description:'Coffee',amount:'5.00',type:'debit'}]});
  const provider=gateway();provider.transactions=async()=>[{_id:'tx_one',date:'2026-10-02T00:00:00Z',description:'Coffee',amount:'-5.00'},{_id:'tx_two',date:'2026-10-02T00:00:00Z',description:'Coffee',amount:'-5.00'}];
  const result=await syncFeedsForUser(db,userId,{organisationId,userId,gateway:provider},now);
  expect(result.imported).toBe(1);expect(result.duplicates).toBe(1);expect(await db.select().from(bankTransactions)).toHaveLength(2);
 }));

 it('trusted pre-delete revokes its configured token after membership removal and purges only that company metadata',async()=>withTestDb(async({db})=>{
  await seed(db);const provider=gateway();let revokes=0;provider.revoke=async()=>{revokes++;};const config={organisationId,userId,gateway:provider};
  await syncFeedsForUser(db,userId,config,now);
  const other='22222222-2222-2222-2222-222222222222';await db.insert(organisations).values({id:other,name:'Another company'});await db.insert(bankFeedConnections).values({organisationId:other,userId,status:'connected'});
  await db.update(organisationMemberships).set({removedAt:now}).where(eq(organisationMemberships.organisationId,organisationId));
  await db.delete(activeOrganisationSelections).where(eq(activeOrganisationSelections.userId,userId));
  await bankFeedPreDeleteHook(db,config).onBeforeAccountDelete({userId:'unrelated-user',deletionKey:'unrelated'});expect(revokes).toBe(0);
  await bankFeedPreDeleteHook(db,config).onBeforeAccountDelete({userId,deletionKey:'removed-owner'});expect(revokes).toBe(1);
  expect(await db.select().from(bankFeedConnections)).toMatchObject([{organisationId:other,status:'connected'}]);
  expect(await db.select().from(bankFeedAccounts)).toHaveLength(0);expect(await db.select().from(bankFeedTransactions)).toHaveLength(0);
  expect(await db.select().from(bankTransactions)).toHaveLength(2);
  await expect(syncFeedsForUser(db,userId,config,new Date(now.getTime()+86400001))).rejects.toMatchObject({status:403});
 }));

 it('does not use a provider credential or mutate books when the trusted live daily authorizer denies access',async()=>withTestDb(async({db})=>{
  await seed(db);const provider=gateway();let reads=0,checks=0;provider.accounts=async()=>{reads++;return [];};const config={organisationId,userId,gateway:provider};
  await runDueBankFeeds(db,config,now,async identity=>{checks++;expect(identity).toEqual({organisationId,userId});return false;});
  expect(checks).toBe(1);expect(reads).toBe(0);expect(await db.select().from(bankFeedConnections)).toHaveLength(0);expect(await db.select().from(bankTransactions)).toHaveLength(0);
 }));

});
