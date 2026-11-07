import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ReceiptInbox } from '../ReceiptInbox';
const scan=vi.fn();const upload=vi.fn();const create=vi.fn();
const mode=vi.hoisted(()=>({available:false}));
vi.mock('@/services/capabilitiesService',()=>({getServerCapabilities:async()=>({ai:mode.available?'available':'unavailable'})}));
vi.mock('@/features/storage/api/objectsApi',()=>({objectsApi:{uploadFile:(...args:unknown[])=>upload(...args)},fileToBase64:async()=> 'abc'}));
vi.mock('@/features/ai/api/receiptScanApi',()=>({scanReceiptImage:(...args:unknown[])=>scan(...args)}));
vi.mock('@/features/expenses/api/expensesApi',()=>({expensesApi:{create:(...args:unknown[])=>create(...args)}}));
describe('receipt inbox review',()=>{
 beforeEach(()=>{mode.available=false;vi.clearAllMocks();localStorage.clear();upload.mockResolvedValue({url:'/api/objects/file?key=receipt',path:'receipt'});create.mockResolvedValue({id:'expense'});vi.stubGlobal('crypto',{randomUUID:()=> 'receipt-id',subtle:{digest:async()=>new Uint8Array(32).buffer}})});
 it('prefills a matching existing category from the scanned suggestion without creating categories',async()=>{
  mode.available=true;scan.mockResolvedValue({merchantName:'Supplier',date:'2026-10-01',total:'115.00',tax:'15.00',subtotal:'100.00',items:[],paymentMethod:'card',suggestedCategory:'Office Supplies',confidence:90,notes:null});
  render(<ReceiptInbox existing={[]} categories={[{id:'11111111-1111-4111-8111-111111111111',name:'Office Supplies'}]} companyKey="category-company" canWrite onSaved={vi.fn()}/>);
  await waitFor(()=>expect(screen.getByLabelText('Receipt files')).toBeEnabled());Object.defineProperty(File.prototype,'arrayBuffer',{configurable:true,value:async()=>new ArrayBuffer(2)});
  fireEvent.change(screen.getByLabelText('Receipt files'),{target:{files:[new File(['receipt'],'receipt.png',{type:'image/png'})]}});
  await screen.findByText('Needs review');expect(screen.getByLabelText('Category for receipt.png')).toHaveValue('11111111-1111-4111-8111-111111111111');expect(create).not.toHaveBeenCalled();
 });
 it('uploads without scanning unavailable AI, requires review and explicit save, and preserves exact edited GST',async()=>{
  render(<ReceiptInbox existing={[]} companyKey="company" canWrite onSaved={vi.fn()}/>);
  await waitFor(()=>expect(screen.getByLabelText('Receipt files')).toBeEnabled());
  Object.defineProperty(File.prototype,'arrayBuffer',{configurable:true,value:async()=>new ArrayBuffer(2)});
  fireEvent.change(screen.getByLabelText('Receipt files'),{target:{files:[new File(['receipt'],'receipt.pdf',{type:'application/pdf'})]}});
  await screen.findByText('Needs review');expect(scan).not.toHaveBeenCalled();expect(create).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Description for receipt.pdf'),{target:{value:'Office supplies'}});
  fireEvent.change(screen.getByLabelText('Total for receipt.pdf'),{target:{value:'115.00'}});
  fireEvent.change(screen.getByLabelText('GST for receipt.pdf'),{target:{value:'15.00'}});
  fireEvent.change(screen.getByLabelText('GST treatment for receipt.pdf'),{target:{value:'standard'}});
  fireEvent.click(screen.getByLabelText('I reviewed receipt.pdf and its GST treatment'));
  fireEvent.click(screen.getByRole('button',{name:'Save expense from receipt.pdf'}));
  await waitFor(()=>expect(create).toHaveBeenCalledWith(expect.objectContaining({amount:'115.00',taxAmount:'15.00',receiptUrl:'/api/objects/file?key=receipt'}),expect.any(String)));
  expect(await screen.findByText('Saved')).toBeVisible();
 });
});
