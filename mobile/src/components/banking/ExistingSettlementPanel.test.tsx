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
 fireEvent.press(await screen.findByText('Supplier instalment · $69.00'));
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
