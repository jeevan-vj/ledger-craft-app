export type StripeRemoteAccount = {
  id: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirementsDue: string[];
  disabledReason: string | null;
};

export type StripeWebhookEvent = {
  id: string;
  type: string;
  livemode: boolean;
  account: string | null;
  data: { object: Record<string, unknown> };
};

export type CreateCheckoutSessionInput = {
  paymentLinkId: string;
  organisationId: string;
  connectedAccountId: string;
  invoiceNumber: string;
  amountCents: number;
  platformFeeCents: number;
  customerEmail?: string | null;
  successUrl: string;
  cancelUrl: string;
};

export interface StripeGateway {
  createConnectedAccount(input: { country: 'NZ'; organisationId: string; businessName: string; email: string; idempotencyKey: string }): Promise<StripeRemoteAccount>;
  retrieveConnectedAccount(accountId: string): Promise<StripeRemoteAccount>;
  createAccountLink(input: { accountId: string; returnUrl: string; refreshUrl: string }): Promise<{ url: string; expiresAt: number }>;
  createCheckoutSession(input: CreateCheckoutSessionInput, idempotencyKey: string): Promise<{ id: string; url: string; expiresAt: number }>;
  expireCheckoutSession(sessionId: string): Promise<void>;
  constructWebhookEvent(payload: Uint8Array, signature: string, secret: string): Promise<StripeWebhookEvent>;
}

export type StripeConfig = {
  enabled: boolean;
  mode: 'test' | 'live';
  appUrl: string;
  platformFeeBasisPoints: number;
  platformFeeFixedCents: number;
  webhookSecret: string;
  connectWebhookSecret: string;
};
