import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { GSTReconciliationPanel } from '../GSTReconciliationPanel';
import { GstPeriodReconciliation } from '@/utils/gstReconciliation';

const ready: GstPeriodReconciliation = {
  period: { startDate: '2026-01-01', endDate: '2026-03-31' },
  readiness: 'ready',
  accounts: [
    {
      accountId: 'acc-1',
      accountName: 'Business cheque',
      bankName: 'ANZ',
      status: 'complete',
      sessionId: 's1',
      unmatchedBankCount: 0,
    },
  ],
  unreconciledTransactionCount: 0,
  unreconciledSamples: [],
  figures: [
    {
      id: 'gstOnSales',
      label: 'GST on sales',
      books: 150,
      returnValue: 150,
      difference: 0,
    },
  ],
  figuresMatch: true,
  issues: [],
};

const warning: GstPeriodReconciliation = {
  ...ready,
  readiness: 'warning',
  accounts: [
    {
      ...ready.accounts[0],
      status: 'missing',
      sessionId: null,
    },
  ],
  unreconciledTransactionCount: 2,
  unreconciledSamples: [
    { id: 'tx-1', date: '2026-02-01', description: 'Unknown debit', amount: -45 },
  ],
  issues: ['Business cheque has no bank reconciliation for this GST period'],
};

describe('GSTReconciliationPanel', () => {
  it('shows a ready state when bank recs and figures match', () => {
    render(
      <MemoryRouter>
        <GSTReconciliationPanel
          reconciliation={ready}
          loading={false}
          acknowledged={false}
          onAcknowledgedChange={() => undefined}
        />
      </MemoryRouter>
    );

    expect(screen.getByText(/Bank reconciliations cover this period/i)).toBeInTheDocument();
    expect(screen.getByText('Business cheque')).toBeInTheDocument();
    expect(screen.queryByLabelText(/I have reviewed unmatched items/i)).not.toBeInTheDocument();
  });

  it('requires acknowledgement when recs are incomplete', async () => {
    const user = userEvent.setup();
    const onAck = vi.fn();

    render(
      <MemoryRouter>
        <GSTReconciliationPanel
          reconciliation={warning}
          loading={false}
          acknowledged={false}
          onAcknowledgedChange={onAck}
        />
      </MemoryRouter>
    );

    expect(screen.getByText(/Finish bank recs before filing/i)).toBeInTheDocument();
    expect(screen.getByText('Unknown debit')).toBeInTheDocument();
    await user.click(screen.getByLabelText(/I have reviewed unmatched items/i));
    expect(onAck).toHaveBeenCalledWith(true);
  });
});
