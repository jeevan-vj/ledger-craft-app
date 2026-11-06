import type { StripeAccountStatus, StripeOnboardingLink, StripePaymentLink } from '@ledgercraft/contracts';
import { apiRequest } from '@/features/auth/api/http';
import { randomId } from '@/utils/id';

export const stripeApi = {
  account: () => apiRequest<StripeAccountStatus>('/api/payments/stripe/account'),
  createAccount: () => apiRequest<StripeAccountStatus>('/api/payments/stripe/account', {
    method: 'POST',
    headers: { 'Idempotency-Key': randomId() },
  }),
  refreshAccount: () => apiRequest<StripeAccountStatus>('/api/payments/stripe/account/refresh', { method: 'POST' }),
  onboardingLink: () => apiRequest<StripeOnboardingLink>('/api/payments/stripe/account/onboarding-link', {
    method: 'POST',
    body: JSON.stringify({ platform: 'mobile' }),
  }),
  createPaymentLink: (invoiceId: string) => apiRequest<StripePaymentLink>(`/api/invoices/${invoiceId}/payment-links`, {
    method: 'POST',
    headers: { 'Idempotency-Key': randomId() },
    body: '{}',
  }),
  listPaymentLinks: (invoiceId: string) => apiRequest<{ items: StripePaymentLink[] }>(`/api/invoices/${invoiceId}/payment-links`),
  paymentLink: (invoiceId: string, linkId: string) => apiRequest<StripePaymentLink>(`/api/invoices/${invoiceId}/payment-links/${linkId}`),
  cancelPaymentLink: (invoiceId: string, linkId: string) => apiRequest<StripePaymentLink>(`/api/invoices/${invoiceId}/payment-links/${linkId}/cancel`, { method: 'POST' }),
};
