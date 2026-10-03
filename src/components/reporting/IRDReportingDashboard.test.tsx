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

    await user.click(screen.getByRole('button', { name: /record gst return.*as filed/i }));
    expect(screen.getByText(/cannot submit directly to ird/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText('IRD confirmation reference'), 'GST-2026-12345');
    await user.click(screen.getByRole('button', { name: 'Record as filed' }));

    expect(onSubmitReturn).toHaveBeenCalledWith('return-1', 'GST-2026-12345');
  });
});
