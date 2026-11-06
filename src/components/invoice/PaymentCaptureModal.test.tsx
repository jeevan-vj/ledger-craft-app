import { readPendingInvoicePayment, resumePendingInvoicePayment } from '@/features/accounting-completion/invoicePaymentRecovery';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

vi.mock('@/features/currency/api/currencyApi', () => ({ currencyApi: { get: vi.fn(async () => ({ rates: [{ id: 'usd-rate', currencyCode: 'USD', baseCurrency: 'NZD', effectiveDate: '2026-01-01', rate: '1.65' }] })) } }));

it('keeps the reviewed settlement rate through invoice capture confirmation', async () => {
  const user = userEvent.setup(); const record = vi.fn().mockResolvedValue(undefined);
  render(<PaymentCaptureModal open onOpenChange={vi.fn()} invoice={{ ...invoice(100), currency: 'USD' }} onPaymentRecord={record} />);
  const rate = await screen.findByLabelText('Settlement exchange rate');
  expect(screen.getByRole('button', { name: /review payment/i })).toBeDisabled();
  await user.selectOptions(rate, 'usd-rate');
  await user.click(screen.getByRole('button', { name: /review payment/i }));
  await user.click(screen.getByRole('button', { name: 'Record Payment' }));
  expect(record).toHaveBeenCalledWith(expect.objectContaining({ amount: 100, exchangeRateId: 'usd-rate' }));
});

vi.mock('@/features/accounting-completion/invoicePaymentRecovery', () => ({ readPendingInvoicePayment: vi.fn(async () => undefined), resumePendingInvoicePayment: vi.fn(async () => ({ id: 'replayed' })), discardPendingInvoicePayment: vi.fn() }));

it('recovers a fully paid invoice from capture without creating another payment', async () => {
  vi.stubEnv('VITE_PAYMENTS_API', 'true');
  const user = userEvent.setup(); const create = vi.fn(); const done = vi.fn();
  vi.mocked(readPendingInvoicePayment).mockResolvedValueOnce({ body: { amount: '69.00', paymentDate: '2026-04-22', paymentMethod: 'bank_transfer' } } as never);
  render(<PaymentCaptureModal open onOpenChange={vi.fn()} invoice={invoice(69, 0)} onPaymentRecord={create} onPaymentRecovered={done} />);
  await user.click(await screen.findByRole('button', { name: 'Resume original invoice payment' }));
  await vi.waitFor(() => expect(done).toHaveBeenCalledOnce()); expect(create).not.toHaveBeenCalled();
});

afterEach(() => vi.unstubAllEnvs());
