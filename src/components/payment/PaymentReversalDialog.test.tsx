import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Payment } from '@/types/payment';
import { PaymentReversalDialog } from './PaymentReversalDialog';

const payment: Payment = {
  id: '11111111-1111-4111-8111-111111111111',
  invoiceId: '22222222-2222-4222-8222-222222222222',
  userId: '',
  paymentMethod: 'bank_transfer',
  amount: 100,
  paymentDate: '2026-10-25',
  status: 'completed',
  createdAt: '2026-10-25T00:00:00.000Z',
  updatedAt: '2026-10-25T00:00:00.000Z',
};

describe('PaymentReversalDialog', () => {
  it('requires a reason and submits an auditable reversal', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <PaymentReversalDialog payment={payment} open onOpenChange={vi.fn()} onConfirm={onConfirm} />,
    );

    await user.click(screen.getByRole('button', { name: 'Reverse payment' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/enter a reason/i);
    expect(onConfirm).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Reason'), 'Entered against the wrong invoice');
    await user.clear(screen.getByLabelText('Reversal date'));
    await user.type(screen.getByLabelText('Reversal date'), '2026-10-26');
    await user.click(screen.getByRole('button', { name: 'Reverse payment' }));
    expect(onConfirm).toHaveBeenCalledWith({
      reason: 'Entered against the wrong invoice',
      reversalDate: '2026-10-26',
    });
  });
});
