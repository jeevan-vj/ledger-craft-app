import type { StripeAccountStatus, StripeOnboardingLink, StripePaymentLink, StripeBalance, StripeVerification, StripeOperations, StripeSettlements } from '@ledgercraft/contracts';
import { apiRequest } from '@/features/auth/api/http';
import { randomId } from '@/utils/id';

export const stripeApi = {
  balance: () => apiRequest<StripeBalance>('/api/payments/stripe/balance'),
  operations: () => apiRequest<StripeOperations>('/api/payments/stripe/operations'),
  settlements: () => apiRequest<StripeSettlements>('/api/payments/stripe/settlements'),
  verify: (paymentId: string) => apiRequest<StripeVerification>(`/api/payments/${paymentId}/stripe/verify`, { method: 'POST', body: '{}' }),
  refund: (paymentId: string, reason: string, key: string) => apiRequest<{ id: string; status: string; awaitingWebhook: true }>(`/api/payments/${paymentId}/stripe/refund`, { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify({ reason }) }),
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
