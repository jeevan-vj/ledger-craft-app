import { accountingPeriodStateSchema, type CloseAccountingPeriodRequest, type ReopenAccountingPeriodRequest } from '@ledgercraft/contracts';
import { readApiFailure } from '@/lib/api/readApiError';
async function request(path:string,input?:CloseAccountingPeriodRequest|ReopenAccountingPeriodRequest,scope?:string){
 const response=await fetch(`/api/accounting-periods${path}`,{credentials:'include',...(input?{method:'POST',headers:{'Content-Type':'application/json',...(scope?{'X-Expected-Organisation-ID':scope}:{})},body:JSON.stringify(input)}:{})});
 if(!response.ok){const error=await readApiFailure(response);throw new Error(error.message);}
 return accountingPeriodStateSchema.parse(await response.json());
}
export const accountingPeriodsApi={get:()=>request(''),close:(input:CloseAccountingPeriodRequest,scope?:string)=>request('/close',input,scope),reopen:(input:ReopenAccountingPeriodRequest,scope?:string)=>request('/reopen',input,scope)};
