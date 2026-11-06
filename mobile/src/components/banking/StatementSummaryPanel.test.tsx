import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { StatementSummaryPanel } from './StatementSummaryPanel';
import { settlementMatchingApi } from '@/features/banking/api/settlementMatchingApi';
jest.mock('@/features/banking/api/settlementMatchingApi', () => ({ settlementMatchingApi: { sessions: jest.fn(), summary: jest.fn(), complete: jest.fn() } }));
const session = { id:'statement',status:'in_progress',statementStartDate:'2026-11-01',statementEndDate:'2026-11-06',statementClosingBalance:'-69.00',bookClosingBalance:null };
const summary = { session,bankAccountName:'Operating',bankName:'Test bank',bankBalance:'-69.00',adjustedBankBalance:'-69.00',bookBalance:'-69.00',adjustedBookBalance:'-69.00',finalDifference:'0.00',isReconciled:true,outstandingDeposits:[],outstandingChecks:[],otherAdjustments:[],totalOutstandingDeposits:'0.00',totalOutstandingChecks:'0.00',totalOtherAdjustments:'0.00' };
beforeEach(()=>{jest.clearAllMocks();jest.mocked(settlementMatchingApi.sessions).mockResolvedValue([session] as never);jest.mocked(settlementMatchingApi.summary).mockResolvedValue(summary as never);jest.mocked(settlementMatchingApi.complete).mockResolvedValue({...session,status:'completed',bookClosingBalance:'-69.00'} as never);});
it('uses the authoritative minus69 ledger summary despite null session metadata and completes only after review',async()=>{
 const screen=render(<StatementSummaryPanel bankAccountId="bank"/>);fireEvent.press(screen.getByText('Review bank statement'));fireEvent.press(await screen.findByText('Statement 2026-11-01 to 2026-11-06 · In progress'));
 expect(await screen.findByText('Posted book balance: -$69.00')).toBeTruthy();expect(screen.getByText('Adjusted statement balance: -$69.00')).toBeTruthy();expect(screen.getByText('Final statement difference: $0.00')).toBeTruthy();
 fireEvent.press(screen.getByText('Complete reviewed statement'));expect(settlementMatchingApi.complete).not.toHaveBeenCalled();fireEvent(screen.getByLabelText('Confirm bank statement review'),'valueChange',true);fireEvent.press(screen.getByText('Complete reviewed statement'));
 expect(await screen.findByText('Statement completed')).toBeTruthy();expect(settlementMatchingApi.complete).toHaveBeenCalledWith('statement');
});
it('keeps completion unavailable when the ledger summary fails instead of replacing it with zero',async()=>{
 jest.mocked(settlementMatchingApi.summary).mockRejectedValue(new Error('Ledger summary unavailable'));
 const screen=render(<StatementSummaryPanel bankAccountId="bank"/>);fireEvent.press(screen.getByText('Review bank statement'));fireEvent.press(await screen.findByText('Statement 2026-11-01 to 2026-11-06 · In progress'));
 expect(await screen.findByText('Ledger summary unavailable')).toBeTruthy();expect(screen.queryByText('Complete reviewed statement')).toBeNull();expect(settlementMatchingApi.complete).not.toHaveBeenCalled();expect(screen.getByText('Retry statement summary')).toBeTruthy();
});
it('requires review again when live statement balances change before completion',async()=>{
 const screen=render(<StatementSummaryPanel bankAccountId="bank"/>);fireEvent.press(screen.getByText('Review bank statement'));fireEvent.press(await screen.findByText('Statement 2026-11-01 to 2026-11-06 · In progress'));await screen.findByText('Final statement difference: $0.00');
 jest.mocked(settlementMatchingApi.summary).mockResolvedValue({...summary,bankBalance:'-70.00',adjustedBankBalance:'-70.00',finalDifference:'-1.00',isReconciled:false} as never);fireEvent(screen.getByLabelText('Confirm bank statement review'),'valueChange',true);fireEvent.press(screen.getByText('Complete reviewed statement'));
 expect(await screen.findByText('Statement balances changed. Review the refreshed summary before completing.')).toBeTruthy();expect(settlementMatchingApi.complete).not.toHaveBeenCalled();expect(screen.getByText('Final statement difference: -$1.00')).toBeTruthy();
});
it('shows the server review warning and keeps an unposted bank fee out of a ready statement',async()=>{
 const warning='Legacy book adjustment was not posted. Record the actual bank fee in the ledger before completing.';
 jest.mocked(settlementMatchingApi.summary).mockResolvedValue({...summary,bookBalance:'0.00',adjustedBookBalance:'0.00',finalDifference:'-69.00',isReconciled:false,warnings:[warning]} as never);
 const screen=render(<StatementSummaryPanel bankAccountId="bank"/>);fireEvent.press(screen.getByText('Review bank statement'));fireEvent.press(await screen.findByText('Statement 2026-11-01 to 2026-11-06 · In progress'));
 expect(await screen.findByText(warning)).toBeTruthy();expect(screen.getByText('Posted book balance: $0.00')).toBeTruthy();expect(screen.getByText('Final statement difference: -$69.00')).toBeTruthy();
 fireEvent.press(screen.getByText('Complete reviewed statement'));expect(settlementMatchingApi.complete).not.toHaveBeenCalled();
});
it('requires a fresh review when server warnings change even if the balances are unchanged',async()=>{
 const screen=render(<StatementSummaryPanel bankAccountId="bank"/>);fireEvent.press(screen.getByText('Review bank statement'));fireEvent.press(await screen.findByText('Statement 2026-11-01 to 2026-11-06 · In progress'));await screen.findByText('Final statement difference: $0.00');
 const warning='A legacy unposted adjustment has been excluded from the ledger balance.';
 jest.mocked(settlementMatchingApi.summary).mockResolvedValue({...summary,warnings:[warning]} as never);fireEvent(screen.getByLabelText('Confirm bank statement review'),'valueChange',true);fireEvent.press(screen.getByText('Complete reviewed statement'));
 expect(await screen.findByText('Statement balances or review warnings changed. Review the refreshed summary before completing.')).toBeTruthy();expect(screen.getByText(warning)).toBeTruthy();expect(settlementMatchingApi.complete).not.toHaveBeenCalled();
});
