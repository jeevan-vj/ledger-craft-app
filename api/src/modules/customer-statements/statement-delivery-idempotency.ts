import { and, eq } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { idempotencyKeys } from '../../db/schema/idempotency';
import { withOrganisationTx } from '../auth/bind-organisation';
import { getIdempotencyRecord, insertIdempotencyRecord, assertReplayMatches, hashIdempotencyPayload, type IdempotencyScope } from '../invoices/idempotency';
import { HTTPException } from 'hono/http-exception';
export async function claimStatementDelivery(db: Database,userId:string,customerId:string,key:string|undefined,body:unknown){
 return withOrganisationTx(db,userId,async(tx,ctx)=>{
  if(!['owner','admin','accountant'].includes(ctx.role))throw new HTTPException(403,{message:'An owner, administrator or accountant must send customer statements'});
  if(!key)return {claimed:true as const};
  const scope:IdempotencyScope={key,method:'POST',path:`/customers/${customerId}/statement/send`,requestHash:hashIdempotencyPayload(body)};
  const previous=await getIdempotencyRecord(tx,ctx,scope);
  if(previous){assertReplayMatches(previous.requestHash,scope.requestHash);if(previous.responseStatus===202)throw new HTTPException(409,{message:'Statement delivery is in progress or uncertain. Review before sending again.'});if(previous.responseStatus!==200)throw new HTTPException(502,{message:'Previous statement delivery failed. Review before starting a new send.'});return {claimed:false as const,response:previous.responseBody};}
  await insertIdempotencyRecord(tx,ctx,scope,{status:202,body:{pending:true}});return {claimed:true as const,scope,ctx};
 });
}
export async function finishStatementDelivery(db:Database,claim:Awaited<ReturnType<typeof claimStatementDelivery>>,status:number,body:unknown){
 if(!claim.claimed||!('scope'in claim)||!claim.scope||!claim.ctx)return;
 await db.update(idempotencyKeys).set({responseStatus:status,responseBody:body}).where(and(eq(idempotencyKeys.organisationId,claim.ctx.organisationId),eq(idempotencyKeys.userId,claim.ctx.userId),eq(idempotencyKeys.method,claim.scope.method),eq(idempotencyKeys.path,claim.scope.path),eq(idempotencyKeys.key,claim.scope.key)));
}
