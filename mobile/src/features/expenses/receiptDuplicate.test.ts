import { receiptDuplicate } from './receiptDuplicate';
describe('receipt duplicate review',()=>{
 it('warns for a saved file digest or same vendor, date and exact gross amount',()=>{
  expect(receiptDuplicate({receiptHash:'a',vendorName:'Supplier',expenseDate:'2026-10-01',amount:'115.00'},[{receiptHash:'a'}])).toBe(true);
  expect(receiptDuplicate({vendorName:' Supplier ',expenseDate:'2026-10-01',amount:'115.00'},[{vendorName:'supplier',expenseDate:'2026-10-01',amountText:'115'}])).toBe(true);
  expect(receiptDuplicate({vendorName:'Supplier',expenseDate:'2026-10-01',amount:'115.00'},[{vendorName:'Supplier',expenseDate:'2026-10-01',amountText:'115.01'}])).toBe(false);
 });
});
