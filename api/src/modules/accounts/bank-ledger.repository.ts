import { and, eq, inArray, lte, sql } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { accounts, journalEntries, journalEntryLines } from '../../db/schema/accounts';
import { bankAccounts } from '../../db/schema/bank';
export async function ownedBank(tx:Database,organisationId:string,id:string){return (await tx.select().from(bankAccounts).where(and(eq(bankAccounts.organisationId,organisationId),eq(bankAccounts.id,id))))[0];}
export async function linkedAccounts(tx:Database,organisationId:string,code:string){return tx.select().from(accounts).where(and(eq(accounts.organisationId,organisationId),eq(accounts.accountNumber,code)));}
export async function ledgerAccount(tx:Database,organisationId:string,id:string){return (await tx.select().from(accounts).where(and(eq(accounts.organisationId,organisationId),eq(accounts.id,id))))[0];}
export async function hasPostedHistoryThrough(tx:Database,organisationId:string,id:string,through:string){
 const rows=await tx.select({id:journalEntries.id}).from(journalEntryLines).innerJoin(journalEntries,and(eq(journalEntries.organisationId,organisationId),eq(journalEntries.id,journalEntryLines.journalEntryId))).where(and(eq(journalEntryLines.organisationId,organisationId),eq(journalEntryLines.accountId,id),inArray(journalEntries.status,['posted','reversed']),lte(journalEntries.entryDate,through))).limit(1);return rows.length>0;
}

export async function matchingCodes(tx:Database,organisationId:string,code:string){return tx.select({id:accounts.id}).from(accounts).where(and(eq(accounts.organisationId,organisationId),sql`upper(trim(${accounts.accountNumber})) = ${code}`)).limit(1);}
