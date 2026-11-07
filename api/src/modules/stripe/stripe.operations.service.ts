import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import { withOrganisationTx, type OrganisationContext } from '../auth/bind-organisation';
import { hasPermission } from '../auth/permissions';
import { decimal, moneyToCents, roundMoney } from '../invoices/money';
import { hasActiveCreditNotes } from '../credit-notes/credit-notes.repository';
import { reversePaymentInTx } from '../payments/payments.service';
import { postBalancedEntry, reversePosting, systemAccount } from '../accounting/posting';
import { localDateIn } from '../accounting/organisation-date';
import type { StripeConfig, StripeGateway, StripeRemotePayment } from './stripe.gateway';
import * as links from './stripe.repository';
import * as repo from './stripe.operations.repository';

function manage(ctx: OrganisationContext) {
  if (!hasPermission(ctx.role, 'payments.manage')) throw new HTTPException(403, { message: 'Missing permission: payments.manage' });
}
function enabled(gateway?: StripeGateway, config?: StripeConfig): asserts gateway is StripeGateway {
  if (!config?.enabled || !gateway) throw new HTTPException(404, { message: 'Card payments are not available' });
}
function capability<T>(value: T | undefined): asserts value is T {
  if (!value) throw new HTTPException(503, { message: 'Stripe provider does not support this operation' });
}
export function integrity(remote: StripeRemotePayment, link: { id: string; organisationId: string; amount: string; platformFee: string }, accountId: string) {
  const valid = Number.isSafeInteger(remote.amountCents) && Number.isSafeInteger(remote.platformFeeCents)
    && remote.status === 'succeeded' && remote.currency === 'nzd'
    && remote.paymentLinkId === link.id && remote.organisationId === link.organisationId
    && remote.destinationAccountId === accountId && BigInt(remote.amountCents) === moneyToCents(link.amount)
    && BigInt(remote.platformFeeCents) === moneyToCents(link.platformFee);
  if (!valid) throw new HTTPException(409, { message: 'Stripe payment integrity did not match the stored invoice link' });
}
export async function postFee(tx: Database, ctx: OrganisationContext, link: { id: string; platformFee: string }, date: string) {
  if (decimal(link.platformFee).compare(0) <= 0) return;
  const clearing = await systemAccount(tx, ctx, '1130'); const expense = await systemAccount(tx, ctx, '5100');
  await postBalancedEntry(tx, ctx, { date, description: 'Stripe platform fee (GST treatment requires review)', referenceType: 'stripe_platform_fee', referenceId: link.id, lines: [
    { accountId: expense, description: 'Platform fee; no input GST assumed', debit: link.platformFee, credit: '0.00' },
    { accountId: clearing, description: 'Platform fee deducted from clearing', debit: '0.00', credit: link.platformFee },
  ] });
}

export async function verify(db: Database, userId: string, paymentId: string, gateway?: StripeGateway, config?: StripeConfig) {
  enabled(gateway, config); capability(gateway.retrievePayment);
  const facts = await withOrganisationTx(db, userId, async (tx, ctx) => {
    manage(ctx); const found = await repo.paymentLink(tx, ctx.organisationId, paymentId);
    if (!found?.link.stripePaymentIntentId) throw new HTTPException(404, { message: 'Stripe payment not found' });
    const account = await links.getConnectedAccount(tx, ctx.organisationId); if (!account) throw new HTTPException(409, { message: 'Stripe account not connected' });
    return { ...found, ctx, account };
  });
  const remote = await gateway.retrievePayment(facts.link.stripePaymentIntentId!);
  const differences: string[] = [];
  if (!Number.isSafeInteger(remote.amountCents) || BigInt(remote.amountCents) !== moneyToCents(facts.payment.amount)) differences.push('amount');
  const remoteStatus = remote.refundedCents === remote.amountCents && remote.refundedCents > 0 ? 'refunded' : remote.status === 'succeeded' ? 'completed' : 'pending';
  if (facts.payment.status !== remoteStatus) differences.push('status');
  if (remote.refundedCents > 0 && remote.refundedCents < remote.amountCents) differences.push('partial_refund');
  if (remote.currency !== 'nzd') differences.push('currency');
  if (remote.destinationAccountId !== facts.account.stripeAccountId || remote.organisationId !== facts.ctx.organisationId || remote.paymentLinkId !== facts.link.id) differences.push('routing');
  if (BigInt(remote.platformFeeCents) !== moneyToCents(facts.link.platformFee)) differences.push('platform_fee');
  const row = await db.transaction(tx => repo.record(tx, { organisationId: facts.ctx.organisationId, userId, paymentId, stripeObjectId: remote.id, kind: 'payment', result: differences.length ? 'mismatch' : 'match', differences }));
  return { id: row.id, result: row.result, differences, checkedAt: row.createdAt.toISOString() };
}
export async function balance(db: Database, userId: string, gateway?: StripeGateway, config?: StripeConfig) {
  enabled(gateway, config); capability(gateway.retrieveBalance);
  const facts = await withOrganisationTx(db, userId, async (tx, ctx) => {
    manage(ctx); const account = await links.getConnectedAccount(tx, ctx.organisationId);
    if (!account) throw new HTTPException(409, { message: 'Connect Stripe first' });
    return { ctx, account, ledger: await repo.clearingBalance(tx, ctx.organisationId) };
  });
  const remote = await gateway.retrieveBalance(facts.account.stripeAccountId);
  if (![remote.availableCents, remote.pendingCents].every(Number.isSafeInteger)) throw new HTTPException(502, { message: 'Stripe returned invalid balance amounts' });
  const available = roundMoney(decimal(String(remote.availableCents)).div('100')); const pending = roundMoney(decimal(String(remote.pendingCents)).div('100'));
  const difference = roundMoney(decimal(available).add(pending).sub(facts.ledger));
  return { currency: 'NZD' as const, available, pending, ledgerClearing: facts.ledger, difference, checkedAt: new Date().toISOString(), warnings: [...(difference !== '0.00' ? ['Stripe and posted clearing differ. Review fees, payouts, refunds and unsettled activity; this check does not change books.'] : []), 'Platform fees have no assumed input GST. Confirm their supporting tax invoices.'] };
}
export async function refund(db: Database, userId: string, paymentId: string, reason: string, key: string, gateway?: StripeGateway, config?: StripeConfig) {
  enabled(gateway, config); capability(gateway.retrievePayment); capability(gateway.createFullRefund);
  const facts = await withOrganisationTx(db, userId, async (tx, ctx) => {
    manage(ctx); const found = await repo.paymentLink(tx, ctx.organisationId, paymentId); const account = await links.getConnectedAccount(tx, ctx.organisationId);
    if (!found?.link.stripePaymentIntentId || !account) throw new HTTPException(404, { message: 'Stripe payment not found' });
    if (found.payment.status !== 'completed') throw new HTTPException(409, { message: 'Only a completed Stripe payment can be refunded' });
    if (await hasActiveCreditNotes(tx, ctx.organisationId, found.payment.invoiceId)) throw new HTTPException(409, { message: 'This invoice has active credits. Review the credit/refund allocation before requesting a Stripe refund.' });
    return { ...found, account, ctx };
  });
  const remote = await gateway.retrievePayment(facts.link.stripePaymentIntentId!); integrity(remote, facts.link, facts.account.stripeAccountId);
  if (remote.refundedCents > 0 && remote.refundedCents !== remote.amountCents) throw new HTTPException(409, { message: 'This payment has a partial refund. Review it in Stripe; the full-refund action is unavailable.' });
  const result = await gateway.createFullRefund(remote.id, `refund:${facts.ctx.organisationId}:${paymentId}:${key}`);
  await db.transaction(tx => repo.record(tx, { organisationId: facts.ctx.organisationId, userId, paymentId, stripeObjectId: result.id, kind: 'refund_requested', result: result.status, details: { reason } }));
  return { ...result, awaitingWebhook: true as const };
}
export async function applyRefund(db: Database, remote: StripeRemotePayment, eventId: string, eventType: string, livemode: boolean) {
  const link = await repo.linkByIntent(db, remote.id);
  if (!link || !link.paymentId) throw new HTTPException(409, { message: 'Refund needs its original payment recorded first' });
  const account = await links.getConnectedAccount(db, link.organisationId); if (!account) throw new HTTPException(409, { message: 'Stripe account is unavailable' });
  integrity(remote, link, account.stripeAccountId);
  await db.transaction(async tx => {
    if (!await links.claimEvent(tx, { id: eventId, organisationId: link.organisationId, type: eventType, livemode })) return;
    const ctx: OrganisationContext = { organisationId: link.organisationId, userId: link.userId, role: 'owner' };
    if (remote.refundedCents !== remote.amountCents) {
      await repo.record(tx, { organisationId: link.organisationId, paymentId: link.paymentId, stripeObjectId: remote.id, kind: 'refund', result: 'review_required', differences: ['partial_refund'], details: { warning: 'Partial refunds require a reviewed credit and refund allocation. No financial record changed.' } });
      await links.completeEvent(tx, eventId, 'processed'); return;
    }
    const found = await repo.paymentLink(tx, link.organisationId, link.paymentId!);
    if (found?.payment.status !== 'refunded') await reversePaymentInTx(tx, ctx, link.paymentId!, { reason: 'Full refund confirmed by Stripe', reversalDate: localDateIn(new Date(), 'Pacific/Auckland') });
    if (remote.applicationFeeRefundedCents === remote.platformFeeCents) await reversePosting(tx, ctx, { referenceType: 'stripe_platform_fee', referenceId: link.id, reversalType: 'stripe_platform_fee_reversal', date: localDateIn(new Date(), 'Pacific/Auckland'), description: 'Platform fee returned by Stripe' });
    else await repo.record(tx, { organisationId: link.organisationId, paymentId: link.paymentId, stripeObjectId: remote.id, kind: 'refund', result: 'review_required', differences: ['application_fee_not_fully_refunded'] });
    await links.completeEvent(tx, eventId, 'processed');
  });
}
export async function operations(db: Database, userId: string) {
  return withOrganisationTx(db, userId, async (tx, ctx) => { manage(ctx); return { items: (await repo.list(tx, ctx.organisationId)).map(row => ({ id: row.id, kind: row.kind, result: row.result, paymentId: row.paymentId, stripeObjectId: row.stripeObjectId, differences: row.differences, details: row.details, createdAt: row.createdAt.toISOString() })) }; });
}
export async function settlements(db: Database, userId: string) {
  return withOrganisationTx(db, userId, async (tx, ctx) => { manage(ctx); return { items: await repo.settlements(tx, ctx.organisationId) }; });
}

/** ApplicationFee events refer to a charge, not a payment_intent. A fee refund
 * is independent of a customer refund and must never reverse that payment. */
export async function applyFeeRefund(db: Database, remote: StripeRemotePayment, eventId: string, eventType: string, livemode: boolean) {
  const link = await repo.linkByIntent(db, remote.id);
  if (!link) throw new HTTPException(409, { message: 'Application fee needs its original payment link recorded first' });
  const account = await links.getConnectedAccount(db, link.organisationId);
  if (!account) throw new HTTPException(409, { message: 'Stripe account is unavailable' });
  integrity(remote, link, account.stripeAccountId);
  await db.transaction(async tx => {
    if (!await links.claimEvent(tx, { id: eventId, organisationId: link.organisationId, type: eventType, livemode })) return;
    const ctx = { organisationId: link.organisationId, userId: link.userId, role: 'owner' as const };
    if (remote.platformFeeCents > 0 && remote.applicationFeeRefundedCents === remote.platformFeeCents) {
      await reversePosting(tx, ctx, { referenceType: 'stripe_platform_fee', referenceId: link.id, reversalType: 'stripe_platform_fee_reversal', date: localDateIn(new Date(), 'Pacific/Auckland'), description: 'Application fee returned by Stripe' });
    } else {
      await repo.record(tx, { organisationId: link.organisationId, paymentId: link.paymentId, stripeObjectId: remote.id, kind: 'application_fee.refunded', result: 'review_required', differences: ['partial_or_unconfirmed_fee_refund'] });
    }
    await links.completeEvent(tx, eventId, 'processed');
  });
}
