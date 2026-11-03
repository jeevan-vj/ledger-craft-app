import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StripePaymentLinkDialog } from './StripePaymentLinkDialog';
import { stripeApi } from '@/features/stripe/api/stripeApi';

vi.mock('@/features/stripe/api/stripeApi', () => ({
  stripeApi: { listPaymentLinks: vi.fn(), createPaymentLink: vi.fn(), paymentLink: vi.fn(), cancelPaymentLink: vi.fn() },
}));

describe('StripePaymentLinkDialog', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(stripeApi.listPaymentLinks).mockResolvedValue({ items: [] }); });

  it('shows the exact platform fee and a scannable hosted-payment link', async () => {
    vi.mocked(stripeApi.createPaymentLink).mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111', invoiceId: '22222222-2222-4222-8222-222222222222',
      status: 'open', amount: '115.00', currency: 'NZD', platformFee: '4.90',
      payUrl: 'https://easybiz.example/pay/test-token', expiresAt: '2026-10-30T01:00:00.000Z',
      createdAt: '2026-10-29T01:00:00.000Z', paymentId: null, receiptId: null,
    });
    render(<StripePaymentLinkDialog open onOpenChange={vi.fn()} invoice={{ id: '22222222-2222-4222-8222-222222222222', invoiceNumber: 'INV-2026-001', balanceDue: 115, currency: 'NZD' }} />);
    fireEvent.click(await screen.findByRole('button', { name: /create payment link/i }));
    expect(await screen.findByText('NZ$4.90')).toBeInTheDocument();
    expect(screen.getByLabelText('Stripe payment QR code')).toBeInTheDocument();
    expect(screen.getByDisplayValue('https://easybiz.example/pay/test-token')).toBeInTheDocument();
    await waitFor(() => expect(stripeApi.createPaymentLink).toHaveBeenCalledWith('22222222-2222-4222-8222-222222222222', { amount: '115.00' }));
  });
});
