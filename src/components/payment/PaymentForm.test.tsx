import { readPendingInvoicePayment, resumePendingInvoicePayment } from '@/features/accounting-completion/invoicePaymentRecovery';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

vi.mock('@/features/currency/api/currencyApi', () => ({ currencyApi: { get: vi.fn(async () => ({ rates: [
  { id: 'rate-usd', currencyCode: 'USD', baseCurrency: 'NZD', effectiveDate: '2026-01-01', rate: '1.65' },
  { id: 'rate-future', currencyCode: 'USD', baseCurrency: 'NZD', effectiveDate: '2099-01-01', rate: '9.99' },
] })) } }));

it('requires an explicit reviewed exchange rate for a foreign invoice settlement', async () => {
  const user = userEvent.setup(); const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(<PaymentForm invoice={{ ...invoice(100), currency: 'USD' }} onSubmit={onSubmit} onCancel={vi.fn()} />);
  const rate = await screen.findByLabelText('Settlement exchange rate');
  expect(rate).toHaveAccessibleName('Settlement exchange rate');
  expect(screen.getByRole('button', { name: /record payment/i })).toBeDisabled();
  expect(screen.queryByRole('option', { name: /9.99/ })).not.toBeInTheDocument();
  await user.selectOptions(rate, 'rate-usd');
  await user.click(screen.getByRole('button', { name: /record payment/i }));
  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ amount: 100, exchangeRateId: 'rate-usd' }));
});

vi.mock('@/features/accounting-completion/invoicePaymentRecovery', () => ({ readPendingInvoicePayment: vi.fn(async () => undefined), resumePendingInvoicePayment: vi.fn(async () => ({ id: 'replayed' })), discardPendingInvoicePayment: vi.fn() }));

it('resumes an uncertain original payment when its invoice already has zero balance', async () => {
  vi.stubEnv('VITE_PAYMENTS_API', 'true');
  const user = userEvent.setup(); const create = vi.fn(); const done = vi.fn();
  vi.mocked(readPendingInvoicePayment).mockResolvedValueOnce({ body: { amount: '69.00', paymentDate: '2026-04-22', paymentMethod: 'bank_transfer' } } as never);
  render(<PaymentForm invoice={invoice(0)} onSubmit={create} onCancel={vi.fn()} onRecovered={done} />);
  await user.click(await screen.findByRole('button', { name: 'Resume original invoice payment' }));
  await vi.waitFor(() => expect(done).toHaveBeenCalledOnce());
  expect(create).not.toHaveBeenCalled();
  expect(resumePendingInvoicePayment).toHaveBeenCalledWith('33333333-3333-3333-3333-333333333333');
});

afterEach(() => vi.unstubAllEnvs());
