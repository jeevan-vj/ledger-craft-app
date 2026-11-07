import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { PaymentForm } from './PaymentForm';
import type { EnhancedInvoice } from '@/types/payment';
vi.mock('@/components/ui/calendar',()=>({Calendar:({onSelect}:{onSelect:(date:Date)=>void})=><button onClick={()=>onSelect(new Date(2026,9,5))}>Choose October 5</button>}));
vi.mock('@/features/accounting-completion/invoicePaymentRecovery',()=>({readPendingInvoicePayment:vi.fn(async()=>undefined)}));
it('submits the selected local calendar day without shifting an Auckland receipt into the previous day',async()=>{
 const onSubmit=vi.fn().mockResolvedValue(undefined);const user=userEvent.setup();
 render(<PaymentForm invoice={{id:'33333333-3333-4333-8333-333333333333',invoiceNumber:'INV-1',date:'2026-10-02',dueDate:'2026-10-31',total:2300,balanceDue:2300,totalPaid:0,currency:'NZD',items:[],subtotal:2000,taxAmount:300,status:'sent',paymentStatus:'unpaid',taxInclusive:false} as EnhancedInvoice} onSubmit={onSubmit} onCancel={vi.fn()}/>);
 await user.click(screen.getByRole('button',{name:/^\d{2} \w{3} \d{4}$/}));await user.click(screen.getByRole('button',{name:'Choose October 5'}));await user.keyboard('{Escape}');await user.click(screen.getByRole('button',{name:/Record Payment/i}));
 expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({paymentDate:'2026-10-05'}));
});
