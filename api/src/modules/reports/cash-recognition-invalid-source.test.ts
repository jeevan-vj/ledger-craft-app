import {expect,it} from 'vitest';
import {recogniseCashRows} from './cash-recognition';
import type {LedgerRow} from './reports.repository';
import type {CashRecognitionLinks} from './cash-recognition.repository';
const row=(journalEntryId:string,accountNumber:string,debit:string,credit:string,referenceType:string,referenceId:string):LedgerRow=>({journalEntryId,entryNumber:journalEntryId,date:'2026-10-10',description:'Imported historical posting',referenceType,referenceId,accountId:accountNumber,accountNumber,accountName:accountNumber,accountType:accountNumber==='1110'?'bank':accountNumber==='4000'?'revenue':'asset',accountClass:accountNumber==='4000'?'revenue':'asset',normalBalance:accountNumber==='4000'?'credit':'debit',currency:'NZD',debit,credit});
it('does not manufacture income to balance an invalid historical source journal',()=>{
 const rows=[row('source','1200','150.00','0.00','invoice','invoice'),row('source','4000','0.00','100.00','invoice','invoice'),row('source','2200','0.00','15.00','invoice','invoice'),row('receipt','1110','75.00','0.00','invoice_payment','payment'),row('receipt','1200','0.00','75.00','invoice_payment','payment')];
 const links={settlements:{sales:[{id:'payment',documentId:'invoice',currency:'NZD'}],purchases:[],credits:[],refunds:[]},sales:[],purchases:[],actions:[]} as unknown as CashRecognitionLinks;
 const result=recogniseCashRows(rows,links);expect(result.rows.some(r=>r.accountNumber==='4000')).toBe(false);expect(result.rows.find(r=>r.accountNumber==='1110')?.debit).toBe('75.00');expect(result.warnings.join(' ')).toMatch(/source|unallocated/);
});
