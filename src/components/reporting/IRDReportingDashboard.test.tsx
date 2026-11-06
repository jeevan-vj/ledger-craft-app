import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { TaxReturn } from '@/types/payment';
import { IRDReportingDashboard } from './IRDReportingDashboard';

const draft: TaxReturn = {
  id: 'return-1',
  userId: '',
  periodStart: '2026-07-01',
  periodEnd: '2026-09-30',
  returnType: 'GST',
  totalSales: 1150,
  totalPurchases: 230,
  gstOnSales: 150,
  gstOnPurchases: 30,
  netGst: 120,
  status: 'draft',
  createdAt: '2026-10-03T00:00:00.000Z',
  updatedAt: '2026-10-03T00:00:00.000Z',
};

describe('IRD reporting filing flow', () => {
  it('explains the myIR boundary and records the confirmation reference', async () => {
    const user = userEvent.setup();
    const onSubmitReturn = vi.fn().mockResolvedValue(undefined);
    render(
      <IRDReportingDashboard
        taxReturns={[draft]}
        nextGSTDueDate="2026-10-28"
        complianceStatus={{ isCompliant: true, issues: [], warnings: [] }}
        onCreateGSTReturn={vi.fn()}
        onCreateIncomeReturn={vi.fn()}
        onSubmitReturn={onSubmitReturn}
        onExportReturn={vi.fn()}
      />,
    );
    expect(screen.queryByText(/All tax obligations are up to date/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Confirm your registered period and due date in myIR/i)).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Compliance' }));
    expect(screen.queryByText('Quarterly filing')).not.toBeInTheDocument();
    expect(screen.queryByText('Due: 7 July 2024')).not.toBeInTheDocument();
    expect(screen.queryByText('GST registration is active')).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'GST Returns' }));

    await user.click(screen.getByRole('button', { name: /record gst return.*as filed/i }));
    expect(screen.getByText(/cannot submit directly to ird/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText('IRD confirmation reference'), 'GST-2026-12345');
    await user.click(screen.getByRole('button', { name: 'Record as filed' }));

    expect(onSubmitReturn).toHaveBeenCalledWith('return-1', 'GST-2026-12345');
  });
});

it('shows saved company worksheet amounts instead of inferring income tax from GST fields', async () => {
  const user = userEvent.setup();
  const companyIncomeTax = { from: '2026-04-01', to: '2027-03-31', entityType: 'nz_company' as const, baseCurrency: 'NZD' as const, taxRate: '28' as const, accountingProfit: '850.00', addBacks: '100.00', deductions: '50.00', taxAdjustedProfit: '900.00', lossesApplied: '200.00', lossesCarriedForward: '0.00', taxableIncome: '700.00', incomeTax: '196.00', taxCredits: '50.00', incomeTaxPayable: '146.00', excessCredits: '0.00', adjustments: [], lossesBroughtForward: '200.00', preparedAt: '2026-11-06T00:00:00.000Z', preparedBy: 'owner', warnings: [] };
  render(<IRDReportingDashboard taxReturns={[{ ...draft, returnType: 'Income_Tax', totalSales: 0, totalPurchases: 0, netGst: 0, returnData: { companyIncomeTax } }]} nextGSTDueDate="" complianceStatus={{ isCompliant: true, issues: [], warnings: [] }} onCreateGSTReturn={vi.fn()} onCreateIncomeReturn={vi.fn()} onSubmitReturn={vi.fn()} onExportReturn={vi.fn()} />);
  await user.click(screen.getByRole('tab', { name: 'Income Tax' }));
  expect(screen.getByText('NZD 850.00')).toBeInTheDocument();
  expect(screen.getByText('NZD 700.00')).toBeInTheDocument();
  expect(screen.getByText('NZD 146.00')).toBeInTheDocument();
});
