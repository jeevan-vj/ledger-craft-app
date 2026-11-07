import { bankFeedSummarySchema, bankFeedSyncResultSchema } from '@ledgercraft/contracts';
import type { z } from 'zod';
import { readApiFailure } from '@/lib/api/readApiError';
async function request<T>(path:string,schema:z.ZodType<T>,body?:unknown):Promise<T>{
 const response=await fetch(`/api/bank-feeds/akahu${path}`,{credentials:'include',method:body===undefined?'GET':'POST',...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
 if(!response.ok)throw new Error((await readApiFailure(response)).message);return schema.parse(await response.json());
}
export const bankFeedsApi={summary:()=>request('',bankFeedSummarySchema),sync:()=>request('/sync',bankFeedSyncResultSchema,{}),disconnect:()=>request('/disconnect',bankFeedSummarySchema,{retainAccountingRecords:true,confirmation:'Disconnect Akahu'})};
