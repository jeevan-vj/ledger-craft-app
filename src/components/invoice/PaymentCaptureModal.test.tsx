import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Invoice } from '@/types';
import { PaymentCaptureModal } from './PaymentCaptureModal';

function invoice(total: number, balanceDue = total): Invoice {
  return {
    id: '33333333-3333-3333-3333-333333333333',
    invoiceNumber: 'INV-2026-0001',
    customerId: '22222222-2222-2222-2222-222222222222',
    customer: { id: '22222222-2222-2222-2222-222222222222', name: 'North Harbour Cafe' } as Invoice['customer'],
    date: '2026-10-01',
    dueDate: '2026-11-01',
    items: [],
    subtotal: total,
    taxAmount: 0,
    total,
    balanceDue,
    status: 'sent',
    currency: 'NZD',
  };
}

describe('PaymentCaptureModal half amount', () => {
  it('defaults to the remaining balance and never offers an invoice overpayment', async () => {
    const user = userEvent.setup();
    render(
      <PaymentCaptureModal
        open
        onOpenChange={vi.fn()}
        invoice={invoice(100, 40)}
        onPaymentRecord={vi.fn()}
      />,
    );

    const amount = screen.getByLabelText(/amount received/i) as HTMLInputElement;
    expect(amount.value).toBe('40');
    expect(screen.getByText(/balance due/i).parentElement).toHaveTextContent('$40.00');
    expect(screen.getByRole('button', { name: /full remaining balance/i })).toHaveTextContent('$40.00');

    await user.clear(amount);
    await user.type(amount, '40.01');
    expect(screen.getByText(/cannot exceed the balance due/i)).toBeInTheDocument();
    expect(screen.queryByText(/customer credit/i)).not.toBeInTheDocument();
  });

  it('calculates a partial instalment from the current balance, not the original total', async () => {
    const user = userEvent.setup();
    render(
      <PaymentCaptureModal
        open
        onOpenChange={vi.fn()}
        invoice={invoice(100, 40)}
        onPaymentRecord={vi.fn()}
      />,
    );

    const amount = screen.getByLabelText(/amount received/i) as HTMLInputElement;
    await user.clear(amount);
    await user.type(amount, '10');
    expect(screen.getByText(/remaining balance of/i)).toHaveTextContent('$30.00');
  });

  it.each([
    [100.01, '50.01'],
    [11.51, '5.76'],
  ] as const)('sets half of %s to %s without exceeding the balance', async (total, half) => {
    const user = userEvent.setup();
    render(
      <PaymentCaptureModal open onOpenChange={vi.fn()} invoice={invoice(total)} onPaymentRecord={vi.fn()} />,
    );

    const button = screen.getByRole('button', { name: /half/i });
    expect(button).toHaveTextContent(half);
    await user.click(button);

    const amount = screen.getByLabelText(/amount received/i) as HTMLInputElement;
    expect(amount.value).toBe(half);
    expect(Number(amount.value)).toBeLessThanOrEqual(total);
  });

  it('halves the remaining balance when earlier payments already exist', async () => {
    const user = userEvent.setup();
    render(
      <PaymentCaptureModal
        open
        onOpenChange={vi.fn()}
        invoice={invoice(100.01, 40)}
        onPaymentRecord={vi.fn()}
      />,
    );

    const button = screen.getByRole('button', { name: /half/i });
    expect(button).toHaveTextContent('20.00');
    await user.click(button);
    const amount = screen.getByLabelText(/amount received/i) as HTMLInputElement;
    expect(amount.value).toMatch(/^\d+(?:\.\d{1,2})?$/);
    expect(Number(amount.value)).toBe(20);
    expect(Number(amount.value)).toBeLessThanOrEqual(40);
  });
});
