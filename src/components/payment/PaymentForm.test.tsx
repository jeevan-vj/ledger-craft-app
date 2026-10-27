import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { EnhancedInvoice } from '@/types/payment';
import { PaymentForm } from './PaymentForm';

function invoice(balanceDue: number): EnhancedInvoice {
  return {
    id: '33333333-3333-3333-3333-333333333333',
    invoiceNumber: 'INV-2026-0001',
    customerId: '22222222-2222-2222-2222-222222222222',
    date: '2026-10-01',
    dueDate: '2026-11-01',
    items: [],
    subtotal: balanceDue,
    taxAmount: 0,
    total: balanceDue,
    status: 'sent',
    currency: '$',
    paymentStatus: 'unpaid',
    totalPaid: 0,
    balanceDue,
    taxInclusive: true,
  };
}

describe('PaymentForm half amount', () => {
  it.each([
    [100.01, '50.01'],
    [11.51, '5.76'],
  ] as const)('sets half of %s to %s without exceeding the balance', async (balanceDue, half) => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<PaymentForm invoice={invoice(balanceDue)} onSubmit={onSubmit} onCancel={vi.fn()} />);

    const button = screen.getByRole('button', { name: /half/i });
    expect(button).toHaveTextContent(half);
    await user.click(button);

    const amount = screen.getByLabelText(/payment amount/i) as HTMLInputElement;
    expect(amount.value).toBe(half);
    expect(Number(amount.value)).toBeLessThanOrEqual(balanceDue);

    await user.click(screen.getByRole('button', { name: /record payment/i }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ amount: Number(half) }));
    expect(String(onSubmit.mock.calls[0]?.[0].amount)).toBe(half);
  });
});
