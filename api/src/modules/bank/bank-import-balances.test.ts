import { expect, it } from 'vitest';
import type { BankAccountDto, ImportBankTransactionsResponse } from '@ledgercraft/contracts';
import { withTestDb } from '../../test/harness';
import { settlementFixture } from '../currency/settlement.test-helper';
it('updates displayed bank balance from newly imported exact movements once, excluding duplicate replays', async()=>withTestDb(async()=>{
 const f=await settlementFixture();try{
 const input={bankAccountId:f.bank.id,skipDuplicates:true,transactions:[{transactionDate:'2026-10-01',description:'Receipt',amount:'12.10',type:'credit'},{transactionDate:'2026-10-02',description:'Cost',amount:'0.10',type:'debit'}]};
 const imported=await f.request<ImportBankTransactionsResponse>('/api/bank-transactions/import','POST',input,201);expect(imported.importedCount).toBe(2);
 expect((await f.request<BankAccountDto>(`/api/bank-accounts/${f.bank.id}`,'GET')).currentBalance).toBe('12.00');
 const replay=await f.request<ImportBankTransactionsResponse>('/api/bank-transactions/import','POST',input,201);expect(replay.importedCount).toBe(0);expect(replay.duplicatesSkipped).toBe(2);
 expect((await f.request<BankAccountDto>(`/api/bank-accounts/${f.bank.id}`,'GET')).currentBalance).toBe('12.00');
 }finally{await f.sql.end();}
}));
it('does not discard an opposite-direction movement sharing date, description and amount', async()=>withTestDb(async()=>{
 const f=await settlementFixture();try{
 const input={bankAccountId:f.bank.id,skipDuplicates:true,transactions:[{transactionDate:'2026-10-01',description:'Bank correction',amount:'1.00',type:'credit'},{transactionDate:'2026-10-01',description:'Bank correction',amount:'1.00',type:'debit'}]};
 const imported=await f.request<ImportBankTransactionsResponse>('/api/bank-transactions/import','POST',input,201);expect(imported.importedCount).toBe(2);expect(imported.duplicatesSkipped).toBe(0);
 expect((await f.request<BankAccountDto>(`/api/bank-accounts/${f.bank.id}`,'GET')).currentBalance).toBe('0.00');
 }finally{await f.sql.end();}
}));
