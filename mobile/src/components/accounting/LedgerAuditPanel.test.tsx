import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { LedgerAuditPanel } from './LedgerAuditPanel';
import { accountingApi } from '@/features/accounting/accountingApi';
jest.mock('@/features/accounting/accountingApi', () => ({ accountingApi: { audit: jest.fn(), apply: jest.fn() } }));
const finding = { key: 'expense:legacy', fingerprint: 'a'.repeat(64), type: 'expense_gst', description: 'Legacy partial claim GST30 should be15', requiresReceiptConfirmation: true, actual: { gst: '30.00', expense: '200.00', cash: '230.00' }, expected: { gst: '15.00', expense: '215.00', cash: '230.00' }, correctionLines: [], sourceId: 'receipt', sourceJournalId: 'journal', sourceDate: '2026-04-10' };
beforeEach(() => { jest.clearAllMocks(); jest.mocked(accountingApi.audit).mockResolvedValue({ findings: [finding], warnings: [] } as never); jest.mocked(accountingApi.apply).mockResolvedValue({ corrections: [{ key: finding.key, journalEntryId: 'correction', replayed: false }] }); });
it('requires original receipt GST confirmation and sends the reviewed immutable correction fingerprint', async () => {
 const screen = render(<LedgerAuditPanel />); fireEvent.press(screen.getByText('Scan ledger'));
 await screen.findByText('Legacy partial claim GST30 should be15');
 expect(screen.getByText('Actual: gst 30.00 · expense 200.00 · cash 230.00')).toBeTruthy();
 expect(screen.getByText('Expected: gst 15.00 · expense 215.00 · cash 230.00')).toBeTruthy();
 fireEvent(screen.getByLabelText('Select correction expense:legacy'), 'valueChange', true);
 fireEvent.changeText(screen.getByLabelText('Ledger correction reason'), 'Reviewed against original receipt');
 fireEvent(screen.getByLabelText('Confirm ledger corrections reviewed'), 'valueChange', true);
 fireEvent.press(screen.getByText('Apply selected ledger corrections')); expect(accountingApi.apply).not.toHaveBeenCalled();
 fireEvent(screen.getByLabelText('Confirm original receipt GST expense:legacy'), 'valueChange', true);
 fireEvent.press(screen.getByText('Apply selected ledger corrections'));
 expect(await screen.findByText('Ledger corrections recorded: 1')).toBeTruthy();
 expect(accountingApi.apply).toHaveBeenCalledWith(expect.objectContaining({ reviewed: true, findings: [{ key: finding.key, fingerprint: finding.fingerprint, receiptGstConfirmed: true }] }));
});
it('shows empty and retryable audit-error states without offering blind corrections', async () => {
 jest.mocked(accountingApi.audit).mockRejectedValueOnce(new Error('Audit unavailable')).mockResolvedValueOnce({ findings: [], warnings: [] });
 const screen = render(<LedgerAuditPanel />); fireEvent.press(screen.getByText('Scan ledger')); await screen.findByText('Audit unavailable');
 fireEvent.press(screen.getByText('Scan ledger')); expect(await screen.findByText('No supported ledger discrepancies found')).toBeTruthy(); expect(accountingApi.apply).not.toHaveBeenCalled();
});
