import { accountSchema } from '@ledgercraft/contracts';
import { purchasesApi } from '@/features/purchases/api/purchasesApi';
import { readApiFailure } from '@/lib/api/readApiError';
export const bankLedgerApi={
 banks:purchasesApi.listBankAccounts,
 async prepare(bankAccountId:string,scope:string){const response=await fetch('/api/accounts/bank-ledger',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json','X-Expected-Organisation-ID':scope},body:JSON.stringify({bankAccountId})});if(!response.ok){const error=await readApiFailure(response);throw new Error(error.message);}return accountSchema.parse(await response.json());},
};
