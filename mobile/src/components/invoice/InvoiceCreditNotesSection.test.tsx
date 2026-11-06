import React from 'react';
import * as SecureStore from 'expo-secure-store';
import { fireEvent, render } from '@testing-library/react-native';
import { InvoiceCreditNotesSection } from './InvoiceCreditNotesSection';
import { creditNotesApi } from '@/features/invoices/api/creditNotesApi';
jest.mock('@/features/invoices/api/creditNotesApi', () => ({ creditNotesApi: { list: jest.fn(), banks: jest.fn(), create: jest.fn(), reverse: jest.fn(), refund: jest.fn(), reverseRefund: jest.fn() } }));
const invoice = { id: '22222222-2222-4222-8222-222222222222', currency: 'NZD', status: 'sent', invoiceNumber: 'INV-1150' };
const credit = { id: 'credit', creditNoteNumber: 'CN-230', total: '230.00', taxAmount: '30.00', currency: 'NZD', status: 'issued', receivableAmount: '0.00', customerCreditAmount: '230.00', refundAvailable: '230.00', refunds: [] };
beforeEach(() => { jest.clearAllMocks(); const storage = new Map<string,string>(); jest.mocked(SecureStore.getItemAsync).mockImplementation(async key => storage.get(key) ?? null); jest.mocked(SecureStore.setItemAsync).mockImplementation(async (key,value) => { storage.set(key,value); }); jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async key => { storage.delete(key); }); jest.mocked(creditNotesApi.list).mockResolvedValue([]); jest.mocked(creditNotesApi.banks).mockResolvedValue([{ id: 'bank', accountName: 'Operating NZD', currency: 'NZD', isActive: true }] as never); jest.mocked(creditNotesApi.create).mockResolvedValue(credit as never); });
it('issues a sourced net200 GST15% credit using the server amount230 and refreshes the invoice', async () => {
 const refresh = jest.fn(); const screen = render(<InvoiceCreditNotesSection ownerId="test-owner" invoice={invoice as never} canWrite onChanged={refresh} />);
 fireEvent.press(screen.getByText('Show credit notes'));
 await screen.findByText('No credit notes for this invoice');
 fireEvent.changeText(screen.getByLabelText('Credit note description'), 'Services returned');
 fireEvent.changeText(screen.getByLabelText('Credit note net amount'), '200.00');
 fireEvent.changeText(screen.getByLabelText('Credit note reason'), 'Reviewed customer service credit');
 fireEvent(screen.getByLabelText('Confirm credit note review'), 'valueChange', true);
 fireEvent.press(screen.getByText('Issue credit note'));
 expect(await screen.findByText('Credit note recorded: CN-230')).toBeTruthy();
 expect(creditNotesApi.create).toHaveBeenCalledWith(expect.objectContaining({ invoiceId: invoice.id, taxInclusive: false, taxRate: '15', items: [{ description: 'Services returned', quantity: '1', rate: '200.00' }] }), expect.any(String));
 expect(refresh).toHaveBeenCalled();
});
it('shows errors and preserves an idempotency key when a credit request is retried', async () => {
 jest.mocked(creditNotesApi.create).mockRejectedValueOnce(new Error('Temporary request failure')).mockResolvedValue(credit as never);
 const screen = render(<InvoiceCreditNotesSection ownerId="test-owner" invoice={invoice as never} canWrite onChanged={jest.fn()} />);
 fireEvent.press(screen.getByText('Show credit notes')); await screen.findByText('No credit notes for this invoice');
 fireEvent.changeText(screen.getByLabelText('Credit note description'), 'Services returned'); fireEvent.changeText(screen.getByLabelText('Credit note net amount'), '200.00'); fireEvent.changeText(screen.getByLabelText('Credit note reason'), 'Reviewed customer service credit');
 fireEvent(screen.getByLabelText('Confirm credit note review'), 'valueChange', true); fireEvent.press(screen.getByText('Issue credit note'));
 await screen.findByText('Temporary request failure'); const firstKey=jest.mocked(creditNotesApi.create).mock.calls[0][1];
 expect(screen.queryByText('Issue credit note')).toBeNull(); fireEvent.press(screen.getByText('Resume saved credit operation')); await screen.findByText('Saved credit operation confirmed: CN-230'); expect(jest.mocked(creditNotesApi.create).mock.calls[1][1]).toBe(firstKey);
});
it('refunds the server230 customer credit then reverses refund and credit without altering receipts', async () => {
 const bank='44444444-4444-4444-8444-444444444444';
 jest.mocked(creditNotesApi.banks).mockResolvedValue([{id:bank,accountName:'Operating NZD',currency:'NZD',isActive:true}] as never);
 jest.mocked(creditNotesApi.list).mockResolvedValue([credit] as never);
 const refunded={...credit,refundAvailable:'0.00',refunds:[{id:'refund-1',amount:'230.00',status:'completed'}]};
 jest.mocked(creditNotesApi.refund).mockResolvedValue(refunded as never);
 jest.mocked(creditNotesApi.reverseRefund).mockResolvedValue({...credit,refunds:[{id:'refund-1',amount:'230.00',status:'reversed'}]} as never);
 jest.mocked(creditNotesApi.reverse).mockResolvedValue({...credit,status:'reversed'} as never);
 const changed=jest.fn();const screen=render(<InvoiceCreditNotesSection ownerId="test-owner" invoice={invoice as never} canWrite onChanged={changed}/>);
 fireEvent.press(screen.getByText('Show credit notes'));await screen.findByText('CN-230 · issued');
 fireEvent.press(screen.getByText('Refund CN-230'));fireEvent.press(screen.getByText('Operating NZD'));
 fireEvent(screen.getByLabelText('Confirm credit note review'),'valueChange',true);fireEvent.press(screen.getByText('Record credit refund'));
 await screen.findByText('Credit note refund recorded: CN-230');
 expect(creditNotesApi.refund).toHaveBeenCalledWith('credit',expect.objectContaining({amount:'230.00',bankAccountId:bank}),expect.any(String));
 fireEvent.changeText(screen.getByLabelText('Credit note reason'),'Reverse duplicate bank refund');fireEvent(screen.getByLabelText('Confirm credit note review'),'valueChange',true);fireEvent.press(screen.getByText('Reverse refund 1'));
 await screen.findByText('Refund reversed: CN-230');
 fireEvent.changeText(screen.getByLabelText('Credit note reason'),'Customer credit no longer required');fireEvent(screen.getByLabelText('Confirm credit note review'),'valueChange',true);fireEvent.press(screen.getByText('Reverse CN-230'));
 await screen.findByText('Credit note reversed: CN-230');expect(changed).toHaveBeenCalledTimes(3);
});
it('clears source credit data and review when navigating to a different invoice', async () => {
 jest.mocked(creditNotesApi.list).mockResolvedValue([credit] as never);
 const screen=render(<InvoiceCreditNotesSection ownerId="test-owner" invoice={invoice as never} canWrite onChanged={jest.fn()}/>);
 fireEvent.press(screen.getByText('Show credit notes'));await screen.findByText('CN-230 · issued');
 screen.rerender(<InvoiceCreditNotesSection ownerId="test-owner" invoice={{...invoice,id:'33333333-3333-4333-8333-333333333333'} as never} canWrite onChanged={jest.fn()}/>);
 expect(screen.queryByText('CN-230 · issued')).toBeNull();expect(screen.getByText('Show credit notes')).toBeTruthy();
});

it('keeps draft invoices out of issuance and explains the required posted source', async () => {
 const screen=render(<InvoiceCreditNotesSection ownerId="test-owner" invoice={{...invoice,status:'draft'} as never} canWrite onChanged={jest.fn()}/>);
 fireEvent.press(screen.getByText('Show credit notes'));await screen.findByText('No credit notes for this invoice');
 expect(screen.queryByText('Issue credit note')).toBeNull();expect(screen.getByText('Issue the invoice before creating a credit note. Draft and cancelled invoices cannot be credited.')).toBeTruthy();
});

it('restores an uncertain credit after screen unmount and resumes its exact request without a second credit intent',async()=>{
 jest.mocked(creditNotesApi.create).mockRejectedValueOnce(new Error('Lost response')).mockResolvedValue(credit as never);
 const first=render(<InvoiceCreditNotesSection ownerId="test-owner" invoice={invoice as never} canWrite onChanged={jest.fn()}/>);fireEvent.press(first.getByText('Show credit notes'));await first.findByText('No credit notes for this invoice');fireEvent.changeText(first.getByLabelText('Credit note description'),'Services returned');fireEvent.changeText(first.getByLabelText('Credit note net amount'),'200.00');fireEvent.changeText(first.getByLabelText('Credit note reason'),'Reviewed customer service credit');fireEvent(first.getByLabelText('Confirm credit note review'),'valueChange',true);fireEvent.press(first.getByText('Issue credit note'));await first.findByText('Lost response');const initial=jest.mocked(creditNotesApi.create).mock.calls[0];first.unmount();
 jest.mocked(creditNotesApi.list).mockResolvedValue([credit] as never);const reopened=render(<InvoiceCreditNotesSection ownerId="test-owner" invoice={invoice as never} canWrite onChanged={jest.fn()}/>);fireEvent.press(reopened.getByText('Show credit notes'));fireEvent.press(await reopened.findByText('Resume saved credit operation'));await reopened.findByText('Saved credit operation confirmed: CN-230');expect(jest.mocked(creditNotesApi.create).mock.calls[1]).toEqual(initial);expect(reopened.queryByText('Resume saved credit operation')).toBeNull();
});
it('resumes a lost refund after reopening even when the server already shows no refundable credit',async()=>{
 const bank='44444444-4444-4444-8444-444444444444';const refunded={...credit,refundAvailable:'0.00',refunds:[{id:'refund-once',amount:'230.00',status:'completed'}]};
 jest.mocked(creditNotesApi.banks).mockResolvedValue([{id:bank,accountName:'Operating NZD',currency:'NZD',isActive:true}] as never);jest.mocked(creditNotesApi.list).mockResolvedValue([credit] as never);jest.mocked(creditNotesApi.refund).mockRejectedValueOnce(new Error('Refund response lost')).mockResolvedValue(refunded as never);
 const first=render(<InvoiceCreditNotesSection ownerId="test-owner" invoice={invoice as never} canWrite onChanged={jest.fn()}/>);fireEvent.press(first.getByText('Show credit notes'));await first.findByText('CN-230 · issued');fireEvent.press(first.getByText('Refund CN-230'));fireEvent.press(first.getByText('Operating NZD'));fireEvent(first.getByLabelText('Confirm credit note review'),'valueChange',true);fireEvent.press(first.getByText('Record credit refund'));await first.findByText('Refund response lost');const original=jest.mocked(creditNotesApi.refund).mock.calls[0];first.unmount();
 jest.mocked(creditNotesApi.list).mockResolvedValue([refunded] as never);const reopened=render(<InvoiceCreditNotesSection ownerId="test-owner" invoice={invoice as never} canWrite onChanged={jest.fn()}/>);fireEvent.press(reopened.getByText('Show credit notes'));fireEvent.press(await reopened.findByText('Resume saved credit operation'));await reopened.findByText('Saved credit operation confirmed: CN-230');expect(jest.mocked(creditNotesApi.refund).mock.calls[1]).toEqual(original);expect(reopened.queryByText('Resume saved credit operation')).toBeNull();
});
