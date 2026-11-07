import Stripe from 'stripe';
import type { StripeRemotePayment } from './stripe.gateway';

export function paymentFacts(intent: Stripe.PaymentIntent, sessionId: string | null = null): StripeRemotePayment {
  const charge = typeof intent.latest_charge === 'object' ? intent.latest_charge : null;
  const fee = charge && typeof charge.application_fee === 'object' ? charge.application_fee : null;
  const destination = intent.transfer_data?.destination;
  return {
    id: intent.id, sessionId, status: intent.status, currency: intent.currency,
    amountCents: intent.amount_received, refundedCents: charge?.amount_refunded ?? 0,
    platformFeeCents: intent.application_fee_amount ?? 0,
    applicationFeeRefundedCents: fee?.amount_refunded ?? 0,
    destinationAccountId: typeof destination === 'string' ? destination : destination?.id ?? null,
    organisationId: intent.metadata.organisation_id ?? null,
    paymentLinkId: intent.metadata.payment_link_id ?? null,
  };
}
