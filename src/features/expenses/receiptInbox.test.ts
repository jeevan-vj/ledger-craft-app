import { describe, expect, it, vi } from 'vitest';
import { processReceipt, isDuplicateReceipt } from './receiptInbox';
const proposal = {merchantName:'Supplier',date:'2026-10-01',total:'115.00',tax:'15.00',subtotal:'100.00',items:[],paymentMethod:'card' as const,suggestedCategory:null,confidence:90,notes:null};
describe('receipt inbox processing',()=>{
 it('uploads each image/PDF before scanning and retains a reviewed draft without saving an expense',async()=>{
  const scan=vi.fn(async()=>proposal);const upload=vi.fn(async()=>({url:'/api/objects/file?key=receipt',path:'receipt'}));const seen:string[]=[];
  for(const type of ['image/png','image/jpeg','image/webp','application/pdf']){
   const result=await processReceipt(new File(['receipt'],`receipt.${type.split('/')[1]}`,{type}),true,{upload,scan,hash:async()=> 'a'.repeat(64)},state=>seen.push(state.status));
   expect(result).toMatchObject({status:'needs_review',receiptUrl:'/api/objects/file?key=receipt',proposal});
  }
  expect(upload).toHaveBeenCalledTimes(4);expect(scan).toHaveBeenCalledTimes(4);expect(seen.slice(0,3)).toEqual(['uploading','scanning','needs_review']);
 });
 it('never scans unavailable AI and preserves the attachment for manual entry',async()=>{
  const scan=vi.fn();const result=await processReceipt(new File(['receipt'],'receipt.pdf',{type:'application/pdf'}),false,{upload:async()=>({url:'/receipt',path:'receipt'}),scan,hash:async()=> 'b'.repeat(64)},()=>{});
  expect(scan).not.toHaveBeenCalled();expect(result).toMatchObject({status:'needs_review',receiptUrl:'/receipt',proposal:null});
 });
 it('retains upload after scan failure and warns for exact digest or vendor/date/amount duplicates',async()=>{
  const result=await processReceipt(new File(['receipt'],'receipt.png',{type:'image/png'}),true,{upload:async()=>({url:'/receipt',path:'receipt'}),scan:async()=>{throw Error('Unreadable')},hash:async()=> 'a'.repeat(64)},()=>{});
  expect(result).toMatchObject({status:'failed',receiptUrl:'/receipt'});
  expect(isDuplicateReceipt({...result,proposal},[{receiptHash:'a'.repeat(64)}])).toBe(true);
  expect(isDuplicateReceipt({...result,proposal},[{vendorName:' supplier ',expenseDate:'2026-10-01',amount:'115'}])).toBe(true);
 });
});
