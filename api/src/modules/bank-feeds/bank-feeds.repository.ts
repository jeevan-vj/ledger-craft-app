import { organisations, organisationMemberships } from '../../db/schema/identity';
import { and, eq, isNull } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { bankFeedAccounts, bankFeedConnections, bankFeedTransactions } from '../../db/schema/bank-feeds';
import { bankTransactions } from '../../db/schema/bank';
export const connection = async(tx:Database,organisationId:string)=>(await tx.select().from(bankFeedConnections).where(eq(bankFeedConnections.organisationId,organisationId)))[0];
export const accounts = (tx:Database,organisationId:string)=>tx.select().from(bankFeedAccounts).where(eq(bankFeedAccounts.organisationId,organisationId));
export async function setConnection(tx:Database,organisationId:string,userId:string,input:Partial<typeof bankFeedConnections.$inferInsert>) {
 await tx.insert(bankFeedConnections).values({organisationId,userId,...input}).onConflictDoUpdate({target:bankFeedConnections.organisationId,set:input});
}
export async function upsertAccount(tx:Database,input:typeof bankFeedAccounts.$inferInsert) {
 await tx.insert(bankFeedAccounts).values(input).onConflictDoUpdate({target:[bankFeedAccounts.organisationId,bankFeedAccounts.externalId],set:{name:input.name,institution:input.institution,status:input.status,lastSyncedAt:input.lastSyncedAt}});
}
export const externalTransaction=async(tx:Database,organisationId:string,externalId:string)=>(await tx.select().from(bankFeedTransactions).where(and(eq(bankFeedTransactions.organisationId,organisationId),eq(bankFeedTransactions.externalId,externalId))))[0];
export async function linkTransaction(tx:Database,input:typeof bankFeedTransactions.$inferInsert,newImport:boolean) {
 if(newImport) await tx.update(bankTransactions).set({source:'feed'}).where(and(eq(bankTransactions.organisationId,input.organisationId),eq(bankTransactions.id,input.transactionId)));
 await tx.insert(bankFeedTransactions).values(input);
}

export async function purgeConnectionMetadata(tx:Database,organisationId:string) {
 await tx.delete(bankFeedTransactions).where(eq(bankFeedTransactions.organisationId,organisationId));
 await tx.delete(bankFeedAccounts).where(eq(bankFeedAccounts.organisationId,organisationId));
 await tx.delete(bankFeedConnections).where(eq(bankFeedConnections.organisationId,organisationId));
}

export async function configuredMembership(tx:Database,organisationId:string,userId:string) {
 return (await tx.select({role:organisationMemberships.role}).from(organisationMemberships).innerJoin(organisations,eq(organisations.id,organisationMemberships.organisationId)).where(and(eq(organisationMemberships.organisationId,organisationId),eq(organisationMemberships.userId,userId),isNull(organisationMemberships.removedAt),isNull(organisations.archivedAt))))[0];
}

export const transactionLinks=(tx:Database,organisationId:string)=>tx.select().from(bankFeedTransactions).where(eq(bankFeedTransactions.organisationId,organisationId));
