import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { InvoicePaymentRecoveryPanel } from './InvoicePaymentRecoveryPanel';
import { readPendingInvoicePayment, resumePendingInvoicePayment, discardPendingInvoicePayment } from '@/features/accounting-completion/invoicePaymentRecovery';
vi.mock('@/features/accounting-completion/invoicePaymentRecovery', () => ({ readPendingInvoicePayment: vi.fn(), resumePendingInvoicePayment: vi.fn(), discardPendingInvoicePayment: vi.fn() }));
vi.mock('@/features/payments/api/paymentsApi', () => ({ paymentsApiEnabled: () => true, paymentsApi: { list: vi.fn(async () => [{ id: 'old', amount: 69, paymentDate: '2026-04-22', status: 'completed' }]) } }));
vi.mock('@/features/invoices/api/invoicesApi', () => ({ invoicesApi: { get: vi.fn(async () => ({ balanceDue: 0, totalPaid: 69, totalCredited: 0 })) } }));
const pending = { version: 1, companyId: 'company', userId: 'owner', invoiceId: 'invoice', key: 'private-key', input: { invoiceId: 'invoice', amount: 69, paymentDate: '2026-04-22', paymentMethod: 'bank_transfer' }, body: { invoiceId: 'invoice', amount: '69.00', paymentDate: '2026-04-22', paymentMethod: 'bank_transfer' }, generateReceipt: true, uncertain: true, createdAt: '2026-04-22T00:00:00.000Z' };
beforeEach(() => { vi.clearAllMocks(); vi.mocked(readPendingInvoicePayment).mockResolvedValue(pending as never); vi.mocked(resumePendingInvoicePayment).mockResolvedValue({ id: 'replayed-payment' } as never); });
it('recovers the stored original receipt even after the invoice is fully paid', async () => {
  const done = vi.fn(); render(<InvoicePaymentRecoveryPanel invoiceId="invoice" onResolved={done} />);
  expect(await screen.findByText(/Original amount: 69.00/)).toBeInTheDocument();
  expect(screen.queryByText('private-key')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Resume original invoice payment' }));
  await screen.findByText('Original payment recovered');
  expect(resumePendingInvoicePayment).toHaveBeenCalledWith('invoice'); expect(done).toHaveBeenCalledOnce();
});
it('keeps an uncertain request on auth failure and blocks replacement', async () => {
  vi.mocked(resumePendingInvoicePayment).mockRejectedValue(new Error('Authentication expired'));
  render(<InvoicePaymentRecoveryPanel invoiceId="invoice" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Resume original invoice payment' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Authentication expired');
  expect(discardPendingInvoicePayment).not.toHaveBeenCalled();
});
it('requires refreshed history and explicit review before discarding a pending request', async () => {
  render(<InvoicePaymentRecoveryPanel invoiceId="invoice" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Check current invoice and payment history' }));
  await screen.findByText(/Current invoice balance: 0.00/);
  expect(screen.getByRole('button', { name: 'Discard pending invoice payment after review' })).toBeDisabled();
  fireEvent.click(screen.getByLabelText('I checked the invoice, receipts and bank history and confirmed this pending payment was not recorded'));
  fireEvent.click(screen.getByRole('button', { name: 'Discard pending invoice payment after review' }));
  await vi.waitFor(() => expect(discardPendingInvoicePayment).toHaveBeenCalledWith('invoice', { reviewed: true }));
});
