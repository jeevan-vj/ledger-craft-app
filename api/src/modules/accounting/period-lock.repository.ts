import { and, desc, eq } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { accountingPeriodEvents, accountingPeriodLocks } from '../../db/schema/accounting-periods';
export async function state(tx:Database,organisationId:string){const [value]=await tx.select().from(accountingPeriodLocks).where(eq(accountingPeriodLocks.organisationId,organisationId));return value??{closedThrough:null,revision:0};}
export async function events(tx:Database,organisationId:string){return tx.select().from(accountingPeriodEvents).where(eq(accountingPeriodEvents.organisationId,organisationId)).orderBy(desc(accountingPeriodEvents.revision));}
export async function change(tx:Database,input:{organisationId:string;actorId:string;action:'close'|'reopen';previousClosedThrough:string|null;newClosedThrough:string|null;reason:string;expectedRevision:number}){
 const revision=input.expectedRevision+1;
 if(input.expectedRevision===0){await tx.insert(accountingPeriodLocks).values({organisationId:input.organisationId,closedThrough:input.newClosedThrough,revision});}
 else{const [updated]=await tx.update(accountingPeriodLocks).set({closedThrough:input.newClosedThrough,revision}).where(and(eq(accountingPeriodLocks.organisationId,input.organisationId),eq(accountingPeriodLocks.revision,input.expectedRevision))).returning();if(!updated)throw new Error('Stale accounting cutoff revision');}
 await tx.insert(accountingPeriodEvents).values({organisationId:input.organisationId,actorId:input.actorId,action:input.action,previousClosedThrough:input.previousClosedThrough,newClosedThrough:input.newClosedThrough,reason:input.reason,revision});
}
