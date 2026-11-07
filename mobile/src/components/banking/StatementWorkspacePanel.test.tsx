import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatementWorkspacePanel } from './StatementWorkspacePanel';
import { settlementMatchingApi } from '@/features/banking/api/settlementMatchingApi';
jest.mock('@/features/banking/api/settlementMatchingApi', () => ({ settlementMatchingApi: { sessions: jest.fn(), createSession: jest.fn(), addAdjustment: jest.fn() } }));
jest.mock('@/components/banking/StatementSummaryPanel', () => ({ StatementSummaryPanel: () => null }));
const clients: QueryClient[] = [];
const wrap = () => { const c = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(c); return render(<QueryClientProvider client={c}><StatementWorkspacePanel bankAccountId="11111111-1111-4111-8111-111111111111" canWrite /></QueryClientProvider>); };
afterEach(() => { clients.forEach(c => c.clear()); clients.length = 0; });
it('creates a resumable statement with exact signed balances', async () => {
  (settlementMatchingApi.sessions as jest.Mock).mockResolvedValue([]);
  (settlementMatchingApi.createSession as jest.Mock).mockResolvedValue({ id: 'session-1' });
  wrap(); fireEvent.press(screen.getByText('Start bank statement'));
  fireEvent.changeText(screen.getByLabelText('Statement start date'), '2026-10-01'); fireEvent.changeText(screen.getByLabelText('Statement end date'), '2026-10-31');
  fireEvent.changeText(screen.getByLabelText('Statement opening balance'), '9007199254740993.01'); fireEvent.changeText(screen.getByLabelText('Statement closing balance'), '-69.00');
  fireEvent.press(screen.getByText('Create statement session'));
  await waitFor(() => expect(settlementMatchingApi.createSession).toHaveBeenCalledWith(expect.objectContaining({ bankAccountId: '11111111-1111-4111-8111-111111111111', statementOpeningBalance: '9007199254740993.01', statementClosingBalance: '-69.00' }), expect.stringMatching(/^statement-mobile-/)));
});
