import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GstPeriodCorrection } from '@ledgercraft/contracts';
import { GstCorrectionReview } from './GstCorrectionReview';
import { gstCorrectionApi } from './gstCorrectionApi';

vi.mock('./gstCorrectionApi', () => ({ gstCorrectionApi: { create: vi.fn(), resolve: vi.fn(), list: vi.fn() } }));

const over: GstPeriodCorrection = {
  id: '11111111-1111-4111-8111-111111111111', originalTaxReturnId: '22222222-2222-4222-8222-222222222222',
  originalPeriodStart: '2026-09-01', originalPeriodEnd: '2026-10-31', targetPeriodStart: '2026-11-01', targetPeriodEnd: '2026-12-31',
  sourceType: 'invoice', sourceId: '33333333-3333-4333-8333-333333333333', action: 'changed', kind: 'output', amount: '12000.00',
  reason: 'October invoice understated output GST', status: 'over_limit', carryForward: 'refused', netDiscrepancy: '12000.00', limit: '1000.00',
  resolution: null, guidance: 'Amend the original return in myIR instead of carrying this correction forward.', createdAt: '2026-11-18T00:00:00.000Z',
};

describe('prior period correction review', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows myIR guidance for an over-limit correction and records the amendment', async () => {
    vi.mocked(gstCorrectionApi.resolve).mockResolvedValue({ ...over, status: 'resolved', carryForward: 'not_applicable' });
    const onChanged = vi.fn();
    render(<GstCorrectionReview from="2026-11-01" to="2026-12-31" corrections={[over]} onChanged={onChanged} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/myIR/);
    expect(screen.getByText(/Box 9 12000.00/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Reason for amending in myIR'), { target: { value: 'Amend the October return in myIR' } });
    fireEvent.click(screen.getByRole('button', { name: 'Amend 12000.00 in myIR' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/myIR/);
    expect(gstCorrectionApi.resolve).toHaveBeenCalledWith(over.id, { resolution: 'amend_in_myir', reason: 'Amend the October return in myIR' });
    expect(onChanged).toHaveBeenCalled();
  });

  it('shows an empty review before any correction is recorded', () => {
    render(<GstCorrectionReview from="2026-11-01" to="2026-12-31" />);
    expect(screen.getByText(/No pending corrections/)).toBeInTheDocument();
    expect(screen.getByText('Record a prior-period correction')).toBeInTheDocument();
  });
});
