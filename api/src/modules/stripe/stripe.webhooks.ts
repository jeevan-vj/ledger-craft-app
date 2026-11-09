import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import { errorCodeFromCause } from '../../http-error';
import * as invoicesRepo from '../invoices/invoices.repository';
import { moneyToCents } from '../invoices/money';
import { createPaymentInTx } from '../payments/payments.service';
import { createReceiptInTx } from '../receipts/receipts.service';
import { localDateIn } from '../accounting/organisation-date';
import type { StripeConfig, StripeGateway, StripeRemotePayment, StripeWebhookEvent } from './stripe.gateway';
import * as repo from './stripe.repository';
import * as ops from './stripe.operations.service';
import * as audit from './stripe.operations.repository';
import { consumeStripeRateLimit } from './stripe.rate-limits';
const str = (value: unknown) => typeof value === 'string' ? value : undefined;
const meta = (object: Record<string, unknown>) => object.metadata && typeof object.metadata === 'object' ? object.metadata as Record<string, unknown> : {};

async function recordPayment(db: Database, remote: StripeRemotePayment, event: StripeWebhookEvent) {
  if (!remote.organisationId || !remote.paymentLinkId) throw new HTTPException(400, { message: 'Stripe payment has no routing metadata' });
  const account = await repo.getConnectedAccount(db, remote.organisationId);
  const link = await repo.getPaymentLink(db, remote.organisationId, remote.paymentLinkId);
  if (!account || !link || (remote.sessionId && remote.sessionId !== link.stripeCheckoutSessionId)) throw new HTTPException(400, { message: 'Stripe payment link routing did not match' });
  ops.integrity(remote, link, account.stripeAccountId);
  if (event.account && event.account !== account.stripeAccountId) throw new HTTPException(400, { message: 'Stripe event account did not match the destination' });
  await db.transaction(async tx => {
    if (!await repo.claimEvent(tx, { id: event.id, organisationId: link.organisationId, type: event.type, livemode: event.livemode })) return;
    const current = await repo.getPaymentLink(tx, link.organisationId, link.id);
    if (current?.status === 'paid') { await repo.completeEvent(tx, event.id, 'ignored'); return; }
    const invoice = await invoicesRepo.getInvoice(tx, link.organisationId, link.invoiceId);
    if (!invoice || invoice.status === 'cancelled' || moneyToCents(invoice.balanceDue) < moneyToCents(link.amount)) {
      await audit.record(tx, { organisationId: link.organisationId, stripeObjectId: remote.id, kind: 'captured_payment', result: 'review_required', differences: ['invoice_balance_changed'], details: { amount: link.amount, paymentLinkId: link.id, warning: 'Captured provider funds require reviewed customer-credit/refund allocation. No invoice overpayment was invented.' } });
      await repo.completeEvent(tx, event.id, 'processed'); return;
    }
    const ctx = { organisationId: link.organisationId, userId: link.userId, role: 'owner' as const };
    const paymentDate = localDateIn(new Date(), 'Pacific/Auckland');
    try {
      const payment = await createPaymentInTx(tx, ctx, { invoiceId: link.invoiceId, paymentMethod: 'online', amount: link.amount, paymentDate, referenceNumber: remote.id, notes: 'Paid through verified Stripe Checkout' }, undefined, { clearingAccountNumber: '1130' });
      const receipt = await createReceiptInTx(tx, ctx, { paymentId: payment.id }, { provider: 'stripe', paymentIntentId: remote.id, checkoutSessionId: link.stripeCheckoutSessionId });
      await ops.postFee(tx, ctx, link, paymentDate);
      await repo.markLinkPaid(tx, link.organisationId, link.id, { paymentIntentId: remote.id, paymentId: payment.id, receiptId: receipt.id });
      await repo.completeEvent(tx, event.id, 'processed');
    } catch (error) {
      if (!(error instanceof HTTPException) || errorCodeFromCause(error.cause, '') !== 'GST_FILING_SETTINGS_REQUIRED') throw error;
      await audit.record(tx, { organisationId: link.organisationId, stripeObjectId: remote.id, kind: 'captured_payment', result: 'review_required', differences: ['gst_filing_settings_required'], details: { amount: link.amount, paymentLinkId: link.id, warning: 'Captured provider funds need saved GST filing settings before they can be applied to this draft. No ledger payment was created.' } });
      await repo.completeEvent(tx, event.id, 'processed');
    }
  });
}
export async function processVerifiedWebhook(db: Database, event: StripeWebhookEvent, gateway: StripeGateway, config: StripeConfig) {
  if (event.livemode !== (config.mode === 'live')) throw new HTTPException(400, { message: 'Stripe event mode does not match this environment' });
  const supported = ['account.updated', 'account.application.deauthorized', 'checkout.session.completed', 'checkout.session.async_payment_succeeded', 'payment_intent.succeeded', 'charge.refunded', 'refund.updated', 'application_fee.refunded', 'payout.paid', 'payout.failed', 'charge.dispute.created', 'charge.dispute.closed'];
  if (!supported.includes(event.type)) return { received: true as const };
  const previous = await repo.eventOutcome(db, event.id);
  if (previous === 'processed' || previous === 'ignored') return { received: true as const };
  await consumeStripeRateLimit(db, 'verified-webhook', 'stripe', 1000, 60_000);

  const object = event.data.object;
  if (event.type === 'account.updated') {
    const accountId = str(object.id) ?? event.account ?? undefined;
    const organisationId = accountId ? await repo.resolveAccountRoute(db, accountId) : undefined;
    if (!organisationId || !accountId) throw new HTTPException(400, { message: 'Unknown Stripe connected account' });
    const declared = str(meta(object).organisation_id);
    if (declared && declared !== organisationId) throw new HTTPException(400, { message: 'Stripe account routing metadata did not match' });
    const current = await repo.getConnectedAccount(db, organisationId);
    if (!current) throw new HTTPException(400, { message: 'Unknown Stripe connected account' });
    const remote = await gateway.retrieveConnectedAccount(accountId);
    await db.transaction(async tx => { if (await repo.claimEvent(tx, { id: event.id, organisationId, type: event.type, livemode: event.livemode })) { await repo.upsertConnectedAccount(tx, { organisationId, userId: current.userId }, remote); await repo.completeEvent(tx, event.id, 'processed'); } });
    return { received: true as const };
  }
  if (event.type === 'account.application.deauthorized') {
    const accountId = event.account ?? str(object.id); const organisationId = accountId ? await repo.resolveAccountRoute(db, accountId) : undefined;
    if (!accountId || !organisationId) return { received: true as const };
    await db.transaction(async tx => {
      if (!await repo.claimEvent(tx, { id: event.id, organisationId, type: event.type, livemode: event.livemode })) return;
      const current = await repo.getConnectedAccount(tx, organisationId); if (!current) return;
      await repo.upsertConnectedAccount(tx, { organisationId, userId: current.userId }, { id: accountId, chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: true, requirementsDue: [], disabledReason: 'Account access revoked' });
      for (const link of await repo.openPaymentLinks(tx, organisationId)) await repo.markLinkCancelled(tx, organisationId, link.id);
      await repo.completeEvent(tx, event.id, 'processed');
    }); return { received: true as const };
  }
  if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) {
    const id = str(object.id); if (!id || !gateway.retrieveCheckoutPayment) throw new HTTPException(503, { message: 'Authoritative Stripe Checkout retrieval is unavailable' });
    await recordPayment(db, await gateway.retrieveCheckoutPayment(id), event); return { received: true as const };
  }
  if (event.type === 'application_fee.refunded') {
    const feeId = str(object.id);
    if (!feeId || !gateway.retrieveFeePayment) throw new HTTPException(503, { message: 'Authoritative Stripe application fee retrieval is unavailable' });
    const remote = await gateway.retrieveFeePayment(feeId);
    await recordPayment(db, remote, { ...event, id: `payment-before-fee:${remote.id}`, type: 'payment_intent.succeeded' });
    await ops.applyFeeRefund(db, remote, event.id, event.type, event.livemode);
    return { received: true as const };
  }
  if (['payment_intent.succeeded', 'charge.refunded', 'refund.updated'].includes(event.type)) {
    const id = event.type === 'payment_intent.succeeded' ? str(object.id) : str(object.payment_intent);
    if (!id || !gateway.retrievePayment) throw new HTTPException(503, { message: 'Authoritative Stripe payment retrieval is unavailable' });
    const remote = await gateway.retrievePayment(id);
    if (event.type === 'payment_intent.succeeded') await recordPayment(db, remote, event);
    else {
      // Refund can arrive before the payment-success event. Record the verified
      // original with its own deterministic event claim before applying reversal.
      await recordPayment(db, remote, { ...event, id: `payment-before-refund:${remote.id}`, type: 'payment_intent.succeeded' });
      await ops.applyRefund(db, remote, event.id, event.type, event.livemode);
    }
    return { received: true as const };
  }
  if (['payout.paid', 'payout.failed', 'charge.dispute.created', 'charge.dispute.closed'].includes(event.type)) {
    const accountId = event.account; const organisationId = accountId ? await repo.resolveAccountRoute(db, accountId) : undefined;
    // Platform disputes resolve to the verified local payment, never metadata alone.
    const paymentIntentId = str(object.payment_intent); const link = paymentIntentId ? await audit.linkByIntent(db, paymentIntentId) : undefined;
    const org = organisationId ?? link?.organisationId;
    if (!org) return { received: true as const };
    await db.transaction(async tx => { if (!await repo.claimEvent(tx, { id: event.id, organisationId: org, type: event.type, livemode: event.livemode })) return;
      await audit.record(tx, { organisationId: org, paymentId: link?.paymentId, stripeObjectId: str(object.id) ?? event.id, kind: event.type, result: 'review_required', differences: ['provider_review_required'], details: { warning: 'Review this provider event in Stripe. Payout destination and dispute-loss policy must be confirmed before posting accounting adjustments.' } });
      await repo.completeEvent(tx, event.id, 'processed'); });
  }
  return { received: true as const };
}
export async function resolveWebhookEvent(db: Database, payload: Uint8Array, signature: string, kind: 'platform' | 'connect', gateway: StripeGateway | undefined, config: StripeConfig | undefined) {
  // The kill switch blocks new links, not receipt of in-flight money events.
  if (!gateway || !config) throw new HTTPException(503, { message: 'Stripe webhook configuration is unavailable' });
  let event: StripeWebhookEvent;
  try { event = await gateway.constructWebhookEvent(payload, signature, kind === 'platform' ? config.webhookSecret : config.connectWebhookSecret); }
  catch { throw new HTTPException(400, { message: 'Invalid Stripe webhook signature' }); }
  return processVerifiedWebhook(db, event, gateway, config);
}
