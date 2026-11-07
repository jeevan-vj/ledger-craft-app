import { HTTPException } from 'hono/http-exception';
import { bankFeedSummarySchema, bankFeedSyncResultSchema } from '../../../../packages/contracts/src/bank-feeds';
import type { Database } from '../../db/client';
import { withOrganisationTx, type OrganisationContext } from '../auth/bind-organisation';
import { localDateIn } from '../accounting/organisation-date';
import { importBankTransactionsInTx } from '../bank/bank.service';
import * as bank from '../bank/bank.repository';
import { decimal, roundMoney } from '../invoices/money';
import type { AccountPreDeleteHook } from '../auth/account-deletion.service';
import { AkahuGateway, AkahuRevokedError, type BankFeedGateway } from './akahu.gateway';
import * as repo from './bank-feeds.repository';

export type BankFeedConfig = { organisationId:string; userId:string; gateway:BankFeedGateway };
export function bankFeedConfigFromEnv(env:object):BankFeedConfig|undefined {
 const {AKAHU_APP_ID,AKAHU_USER_TOKEN,AKAHU_ORGANISATION_ID,AKAHU_USER_ID}=env as {AKAHU_APP_ID?:string;AKAHU_USER_TOKEN?:string;AKAHU_ORGANISATION_ID?:string;AKAHU_USER_ID?:string};
 if(!/^app_[A-Za-z0-9]{16,}$/.test(AKAHU_APP_ID??'')||!/^token_[A-Za-z0-9]{16,}$/.test(AKAHU_USER_TOKEN??'')||!AKAHU_ORGANISATION_ID||!AKAHU_USER_ID) return undefined;
 return {organisationId:AKAHU_ORGANISATION_ID,userId:AKAHU_USER_ID,gateway:new AkahuGateway(AKAHU_APP_ID!,AKAHU_USER_TOKEN!)};
}
async function configuredOrganisationTx<T>(db:Database,config:BankFeedConfig,run:(tx:Database,ctx:OrganisationContext)=>Promise<T>):Promise<T> {
 return db.transaction(async tx=>{const member=await repo.configuredMembership(tx as unknown as Database,config.organisationId,config.userId);if(!member)throw new HTTPException(403,{message:'The configured Personal App owner no longer has access to this company.'});return run(tx as unknown as Database,{organisationId:config.organisationId,userId:config.userId,role:member.role});});
}
const hour=3_600_000,day=24*hour;
function configured(ctx:OrganisationContext,config:BankFeedConfig|undefined):config is BankFeedConfig {return !!config&&config.organisationId===ctx.organisationId;}
function assertWriter(ctx:OrganisationContext,config:BankFeedConfig|undefined):asserts config is BankFeedConfig {
 if(!configured(ctx,config)||ctx.userId!==config.userId||!['owner','admin'].includes(ctx.role)) throw new HTTPException(403,{message:'Only the configured Personal App owner may manage this internal connection.'});
}
async function summary(tx:Database,ctx:OrganisationContext,config?:BankFeedConfig) {
 const available=configured(ctx,config); const row=await repo.connection(tx,ctx.organisationId); const accounts=await repo.accounts(tx,ctx.organisationId);
 return bankFeedSummarySchema.parse({mode:available?'personal':'unavailable',fullAppAvailable:false,status:row?.status??'not_connected',lastAttemptAt:row?.lastAttemptAt?.toISOString()??null,lastSyncedAt:row?.lastSyncedAt?.toISOString()??null,nextSyncAt:row?.lastAttemptAt&&row.status==='connected'?new Date(row.lastAttemptAt.getTime()+day).toISOString():null,
 accounts:accounts.map(a=>({id:a.id,bankAccountId:a.bankAccountId,name:a.name,institution:a.institution,status:a.status,currency:a.currency,lastSyncedAt:a.lastSyncedAt?.toISOString()??null})),
 warnings:[...(!available?['Bank feeds are unavailable. An owner must configure the internal Personal App connection.']:['Internal Personal App: one configured owner and company only. Full App OAuth and public connections are unavailable.']),...(row?.status==='revoked'?['Akahu access was revoked. No further synchronisation will run.']:[]),...(accounts.some(a=>a.status==='INACTIVE')?['An account is inactive. Review it in Akahu before continuing.']:[]),'Feed lines remain unreconciled until reviewed. Existing accounting records are retained on disconnect.']});
}
export const feedSummaryForUser=(db:Database,userId:string,config?:BankFeedConfig)=>withOrganisationTx(db,userId,(tx,ctx)=>summary(tx,ctx,config));
export const syncFeedsForUser=(db:Database,userId:string,config?:BankFeedConfig,now=new Date())=>syncFeeds(db,userId,config,now);
async function syncFeeds(db:Database,userId:string,config:BankFeedConfig|undefined,now:Date,internal=false) {
 const bind=<T>(run:(tx:Database,ctx:OrganisationContext)=>Promise<T>)=>internal&&config?configuredOrganisationTx(db,config,run):withOrganisationTx(db,userId,run);
 const ctx=await bind(async(tx,ctx)=>{
  assertWriter(ctx,config); const current=await repo.connection(tx,ctx.organisationId);
  if(current?.status==='revoked'||current?.status==='disconnected') throw new HTTPException(409,{message:'This connection has stopped. Configure a new reviewed Personal App connection before syncing.'});
  if(current?.lastAttemptAt&&now.getTime()-current.lastAttemptAt.getTime()<hour) throw new HTTPException(429,{message:'Wait at least one hour between Akahu refresh attempts.'});
  await repo.setConnection(tx,ctx.organisationId,userId,{status:'connected',lastAttemptAt:now});return ctx;
 });
 // The secret is never written to SQLite, returned, or included in error messages.
 const provider=config!.gateway; let sourceAccounts;
 try {sourceAccounts=await provider.accounts();}
 catch(error){if(error instanceof AkahuRevokedError) await bind((tx)=>repo.setConnection(tx,ctx.organisationId,userId,{status:'revoked'}));throw error;}
 const to=localDateIn(now,'Pacific/Auckland'); const start=new Date(now);start.setUTCFullYear(start.getUTCFullYear()-1);const from=localDateIn(start,'Pacific/Auckland');
 let prepared;
 try {prepared=await Promise.all(sourceAccounts.map(async account=>({account,transactions:account.status==='ACTIVE'?await provider.transactions(account._id,from,to):[]})));}
 catch(error){if(error instanceof AkahuRevokedError) await bind((tx)=>repo.setConnection(tx,ctx.organisationId,userId,{status:'revoked'}));throw error;}
 return bind(async(tx,currentCtx)=>{
  assertWriter(currentCtx,config);const current=await repo.connection(tx,ctx.organisationId);if(current?.status!=='connected')throw new HTTPException(409,{message:'The feed connection stopped during synchronisation.'});
  let imported=0,duplicates=0;const claimedRows=new Set((await repo.transactionLinks(tx,ctx.organisationId)).map(row=>row.transactionId));const linked=await repo.accounts(tx,ctx.organisationId);
  for(const {account,transactions} of prepared) {
   if(account.balance?.currency!=='NZD') throw new HTTPException(422,{message:'This feed supports NZD statement accounts only. Review the account currency.'});
   const link=linked.find(a=>a.externalId===account._id);
   const normalise=(value:string)=>value.replace(/[\s-]/g,'');
   const existing=link?[]:(await bank.listAccounts(tx,ctx.organisationId)).filter(a=>account.formatted_account&&normalise(a.accountNumber)===normalise(account.formatted_account));
   if(existing.length>1)throw new HTTPException(409,{message:'More than one local account matches this Akahu account number. Review the account mapping.'});
   const local=link?await bank.getAccount(tx,ctx.organisationId,link.bankAccountId):existing[0]??await bank.insertAccount(tx,ctx,{accountName:account.name,accountNumber:account.formatted_account??account._id,bankName:account.connection?.name??'Akahu connected bank',accountType:'checking',currency:'NZD',openingBalance:'0.00'});
   if(!local) throw new HTTPException(409,{message:'A connected bank account is no longer available.'});
   if(local.currency!=='NZD') throw new HTTPException(409,{message:'The connected bank account currency changed. Review the connection.'});
   await repo.upsertAccount(tx,{id:link?.id,organisationId:ctx.organisationId,externalId:account._id,bankAccountId:local.id,name:account.name,institution:account.connection?.name??'Akahu',status:account.status,currency:'NZD',lastSyncedAt:now});
   for(const transaction of transactions) {
    const transactionDate=localDateIn(new Date(transaction.date),'Pacific/Auckland');
    if(transactionDate<from||transactionDate>to) throw new HTTPException(422,{message:'Akahu returned a transaction outside the requested statement dates.'});
    const value=decimal(transaction.amount);if(value.compare(0)===0) continue;
    const amount=roundMoney(value.compare(0)<0?value.mul('-1'):value);const type=value.compare(0)<0?'debit':'credit';
    const prior=await repo.externalTransaction(tx,ctx.organisationId,transaction._id);
    if(prior){const stored=await bank.getTransaction(tx,ctx.organisationId,prior.transactionId);if(!stored||stored.bankAccountId!==local.id||stored.amount!==amount||stored.type!==type||stored.transactionDate!==transactionDate)throw new HTTPException(409,{message:'A previously imported Akahu transaction changed. Original books were retained; review the difference.'});duplicates++;continue;}
    const priorStatement=(await bank.listTransactions(tx,ctx.organisationId,{bankAccountId:local.id})).find(row=>row.source!=='feed'&&!claimedRows.has(row.id)&&row.transactionDate===transactionDate&&row.amount===amount&&row.type===type&&row.description===transaction.description);
    const result=await importBankTransactionsInTx(tx,currentCtx,{bankAccountId:local.id,fileName:'Akahu feed',fileType:'csv',skipDuplicates:!!priorStatement,transactions:[{transactionDate,description:transaction.description||'Bank transaction',amount,type}]});
    const saved=result.transactions[0]??priorStatement;
    if(!saved) throw new HTTPException(409,{message:'An imported transaction conflicts with an existing statement row. Review it before syncing.'});
    await repo.linkTransaction(tx,{organisationId:ctx.organisationId,externalId:transaction._id,bankAccountId:local.id,transactionId:saved.id},result.importedCount>0);
    claimedRows.add(saved.id);imported+=result.importedCount;duplicates+=result.duplicatesSkipped;
   }
  }
  await repo.setConnection(tx,ctx.organisationId,userId,{status:'connected',lastSyncedAt:now});
  return bankFeedSyncResultSchema.parse({imported,duplicates,summary:await summary(tx,ctx,config)});
 });
}
export const disconnectFeedsForUser=(db:Database,userId:string,config?:BankFeedConfig)=>disconnectFeeds(db,userId,config);
async function disconnectFeeds(db:Database,userId:string,config:BankFeedConfig|undefined,internal=false) {
 const bind=<T>(run:(tx:Database,ctx:OrganisationContext)=>Promise<T>)=>internal&&config?configuredOrganisationTx(db,config,run):withOrganisationTx(db,userId,run);
 const ctx=await bind((tx,ctx)=>{assertWriter(ctx,config);return Promise.resolve(ctx);});
 try {await config!.gateway.revoke();} catch(error){if(!(error instanceof AkahuRevokedError))throw error;}
 return bind(async(tx)=>{await repo.setConnection(tx,ctx.organisationId,userId,{status:'disconnected'});return summary(tx,ctx,config);});
}
export type BankFeedDailyAuthorizer=(identity:{organisationId:string;userId:string})=>Promise<boolean>;
export async function runDueBankFeeds(db:Database,config?:BankFeedConfig,now=new Date(),authorize?:BankFeedDailyAuthorizer) {
 if(!config)return;
 if(authorize&&!await authorize({organisationId:config.organisationId,userId:config.userId}))return;
 const current=await repo.connection(db,config.organisationId);
 if(current&&(current.status!=='connected'||(current.lastAttemptAt&&now.getTime()-current.lastAttemptAt.getTime()<day)))return;
 await syncFeeds(db,config.userId,config,now,true);
}
export function bankFeedPreDeleteHook(db:Database,config?:BankFeedConfig):AccountPreDeleteHook {
 return {name:'Akahu',required:true,onBeforeAccountDelete:async({userId})=>{
  if(!config||config.userId!==userId)return;
  // Only this trusted Identity deletion hook bypasses membership: a removed
  // member must still revoke their env-bound token. No client selects the org.
  try {await config.gateway.revoke();}catch(error){if(!(error instanceof AkahuRevokedError))throw error;}
  await db.transaction(async tx=>repo.purgeConnectionMetadata(tx as unknown as Database,config.organisationId));
 }};
}
