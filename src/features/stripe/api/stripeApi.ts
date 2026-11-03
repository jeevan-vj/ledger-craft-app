import type { CreateStripePaymentLinkRequest, StripeAccountStatus, StripeOnboardingLink, StripePaymentLink } from '@ledgercraft/contracts';
import { readApiFailure } from '@/lib/api/readApiError';

export class StripeApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) { super(message); this.name = 'StripeApiError'; }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: 'include', ...init, headers: { 'Content-Type': 'application/json', ...((init?.headers ?? {}) as Record<string, string>) } });
  if (!response.ok) { const failure = await readApiFailure(response); throw new StripeApiError(failure.message, failure.status, failure.code); }
  return response.json() as Promise<T>;
}

export const stripeApi = {
  account: () => request<StripeAccountStatus>('/api/payments/stripe/account'),
  createAccount: () => request<StripeAccountStatus>('/api/payments/stripe/account', { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() } }),
  refreshAccount: () => request<StripeAccountStatus>('/api/payments/stripe/account/refresh', { method: 'POST' }),
  onboardingLink: () => request<StripeOnboardingLink>('/api/payments/stripe/account/onboarding-link', { method: 'POST', body: JSON.stringify({ platform: 'web' }) }),
  listPaymentLinks: (invoiceId: string) => request<{ items: StripePaymentLink[] }>(`/api/invoices/${invoiceId}/payment-links`),
  createPaymentLink: (invoiceId: string, input: CreateStripePaymentLinkRequest) => request<StripePaymentLink>(`/api/invoices/${invoiceId}/payment-links`, { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify(input) }),
  paymentLink: (invoiceId: string, linkId: string) => request<StripePaymentLink>(`/api/invoices/${invoiceId}/payment-links/${linkId}`),
  cancelPaymentLink: (invoiceId: string, linkId: string) => request<StripePaymentLink>(`/api/invoices/${invoiceId}/payment-links/${linkId}/cancel`, { method: 'POST' }),
};
