import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { CustomerStatement } from '@ledgercraft/contracts';
import { StatementDocument } from './StatementDocument';
describe('customer statement document', () => {
  it('shows authoritative running amounts and aging without calculating client totals', () => {
    const statement = { customer: { id: 'customer', name: 'Harbour Cafe', email: 'buyer@example.test' }, businessName: 'Kauri Limited', currency: 'NZD', type: 'activity', from: '2026-10-01', to: '2026-10-31', openingBalance: '100.10', closingBalance: '675.10', lines: [{ id: 'line', date: '2026-10-02', kind: 'invoice', reference: 'INV-001', description: 'Consulting', debit: '575.00', credit: '0.00', runningBalance: '675.10' }], aging: { total: '675.10', current: '575.00', days1To30: '100.10', days31To60: '0.00', days61To90: '0.00', over90: '0.00', unallocatedControl: '0.00', items: [] }, generatedAt: '2026-11-07T00:00:00.000Z', warnings: ['Review unallocated balances.'] } satisfies CustomerStatement;
    render(<StatementDocument value={statement} />);
    expect(screen.getByText('Harbour Cafe')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Statement activity' })).toHaveTextContent('675.10');
    expect(screen.getByText('Review unallocated balances.')).toBeInTheDocument();
  });
});
