import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ExistingSettlementPanel } from './ExistingSettlementPanel';
import { settlementMatchingApi } from '@/features/banking/api/settlementMatchingApi';
jest.mock('@/features/banking/api/settlementMatchingApi', () => ({ settlementMatchingApi: { entries: jest.fn(), sessions: jest.fn(), createSession: jest.fn(), match: jest.fn() } }));
const transaction = { id: 'bank69', bankAccountId: 'bank', type: 'debit', amount: '69.00', transactionDate: '2026-04-20' };
beforeEach(() => { jest.clearAllMocks(); jest.mocked(settlementMatchingApi.entries).mockResolvedValue([{ id: 'paid69', type: 'bill_payment', amount: '69.00', description: 'Supplier instalment', date: '2026-04-20', reference: 'BILL-345' }, { id: 'bill345', type: 'bill', amount: '345.00', description: 'Unpaid bill', date: '2026-04-20', reference: null }] as never); jest.mocked(settlementMatchingApi.sessions).mockResolvedValue([{ id: 'statement', status: 'in_progress', statementStartDate: '2026-04-01', statementEndDate: '2026-04-30' }] as never); jest.mocked(settlementMatchingApi.match).mockResolvedValue({} as never); });
it('matches the actual 69 supplier payment instead of creating a second payment for the345 bill', async () => {
 const complete = jest.fn(); const screen = render(<ExistingSettlementPanel transaction={transaction as never} onMatched={complete} />);
 fireEvent.press(screen.getByText('Find recorded payments and expenses'));
 fireEvent.press(await screen.findByText('Supplier instalment · $69.00 · 2026-04-20 · BILL-345'));
 fireEvent(screen.getByLabelText('Confirm existing settlement match'), 'valueChange', true);
 fireEvent.press(screen.getByText('Match existing settlement'));
 expect(await screen.findByText('Existing settlement matched without another payment')).toBeTruthy();
 expect(settlementMatchingApi.match).toHaveBeenCalledWith('statement', { bankTransactionId: 'bank69', bookItemType: 'bill_payment', bookItemId: 'paid69', status: 'confirmed' });
 expect(screen.queryByText('Unpaid bill')).toBeNull(); expect(complete).toHaveBeenCalled();
});
it('shows a retryable entry error without enabling a match', async () => {
 jest.mocked(settlementMatchingApi.entries).mockRejectedValueOnce(new Error('Entries unavailable'));
 const screen = render(<ExistingSettlementPanel transaction={transaction as never} onMatched={jest.fn()} />);
 fireEvent.press(screen.getByText('Find recorded payments and expenses'));
 expect(await screen.findByText('Entries unavailable')).toBeTruthy();
 expect(settlementMatchingApi.match).not.toHaveBeenCalled();
});
it('matches a posted customer refund without creating another cash expense', async () => {
 jest.mocked(settlementMatchingApi.entries).mockResolvedValue([{ id: 'refund-journal', type: 'credit_refund', amount: '69.00', description: 'Customer refund', date: '2026-04-20', reference: 'CN-1' }] as never);
 const screen = render(<ExistingSettlementPanel transaction={transaction as never} onMatched={jest.fn()} />);
 fireEvent.press(screen.getByText('Find recorded payments and expenses')); fireEvent.press(await screen.findByText('Customer refund · $69.00 · 2026-04-20 · CN-1'));
 fireEvent(screen.getByLabelText('Confirm existing settlement match'), 'valueChange', true); fireEvent.press(screen.getByText('Match existing settlement'));
 expect(await screen.findByText('Existing settlement matched without another payment')).toBeTruthy();
 expect(settlementMatchingApi.match).toHaveBeenCalledWith('statement',{ bankTransactionId: 'bank69',bookItemType:'credit_refund',bookItemId:'refund-journal',status:'confirmed' });
});
it('distinguishes equal customer receipts by their date and reference',async()=>{
 jest.mocked(settlementMatchingApi.entries).mockResolvedValue([{id:'a',type:'payment',amount:'1150.00',description:'Payment - bank_transfer',date:'2026-10-05',reference:'RECEIPT-A'},{id:'b',type:'payment',amount:'1150.00',description:'Payment - bank_transfer',date:'2026-10-06',reference:'RECEIPT-B'}] as never);
 const screen=render(<ExistingSettlementPanel transaction={{...transaction,type:'credit',amount:'1150.00'} as never} onMatched={jest.fn()}/>);fireEvent.press(screen.getByText('Find recorded payments and expenses'));
 expect(await screen.findByText('Payment - bank_transfer · $1,150.00 · 2026-10-05 · RECEIPT-A')).toBeTruthy();expect(screen.getByText('Payment - bank_transfer · $1,150.00 · 2026-10-06 · RECEIPT-B')).toBeTruthy();
});
