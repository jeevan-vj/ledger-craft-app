import { and, desc, eq } from 'drizzle-orm';
import type { StripeAccountStatus, StripePaymentLink } from '@ledgercraft/contracts';
import type { Database } from '../../db/client';
import { stripeAccountRoutes, stripeConnectedAccounts, stripeEvents, stripePaymentLinks } from '../../db/schema/stripe';
import type { StripeRemoteAccount } from './stripe.gateway';
import { centsToMoney } from './stripe.money';

function accountState(remote: StripeRemoteAccount): Exclude<StripeAccountStatus['status'], 'not_connected'> {
  if (remote.chargesEnabled && remote.payoutsEnabled) return 'active';
  if (!remote.detailsSubmitted) return 'onboarding';
  if (remote.disabledReason) return 'disabled';
  return 'restricted';
}

export function accountDto(row: typeof stripeConnectedAccounts.$inferSelect | undefined): StripeAccountStatus {
  return row ? {
    status: row.status,
    chargesEnabled: row.chargesEnabled,
    payoutsEnabled: row.payoutsEnabled,
    detailsSubmitted: row.detailsSubmitted,
    requirementsDue: row.requirementsDue,
    disabledReason: row.disabledReason,
  } : {
    status: 'not_connected', chargesEnabled: false, payoutsEnabled: false,
    detailsSubmitted: false, requirementsDue: [], disabledReason: null,
  };
}

export async function getConnectedAccount(db: Database, organisationId: string) {
  const [row] = await db.select().from(stripeConnectedAccounts).where(eq(stripeConnectedAccounts.organisationId, organisationId));
  return row;
}

export async function upsertConnectedAccount(db: Database, ctx: { organisationId: string; userId: string }, remote: StripeRemoteAccount) {
  const values = {
    organisationId: ctx.organisationId, userId: ctx.userId, stripeAccountId: remote.id,
    status: accountState(remote), chargesEnabled: remote.chargesEnabled, payoutsEnabled: remote.payoutsEnabled,
    detailsSubmitted: remote.detailsSubmitted, requirementsDue: remote.requirementsDue,
    disabledReason: remote.disabledReason, updatedAt: new Date(),
  } as const;
  const existing = await getConnectedAccount(db, ctx.organisationId);
  const [row] = existing
    ? await db.update(stripeConnectedAccounts).set({ stripeAccountId: values.stripeAccountId, status: values.status, chargesEnabled: values.chargesEnabled, payoutsEnabled: values.payoutsEnabled, detailsSubmitted: values.detailsSubmitted, requirementsDue: values.requirementsDue, disabledReason: values.disabledReason, updatedAt: values.updatedAt }).where(eq(stripeConnectedAccounts.organisationId, ctx.organisationId)).returning()
    : await db.insert(stripeConnectedAccounts).values(values).returning();
  const [route] = await db.select().from(stripeAccountRoutes).where(eq(stripeAccountRoutes.stripeAccountId, remote.id));
  if (route) await db.update(stripeAccountRoutes).set({ organisationId: ctx.organisationId }).where(eq(stripeAccountRoutes.stripeAccountId, remote.id));
  else await db.insert(stripeAccountRoutes).values({ stripeAccountId: remote.id, organisationId: ctx.organisationId });
  return row;
}

export async function resolveAccountRoute(db: Database, stripeAccountId: string) {
  const [row] = await db.select().from(stripeAccountRoutes).where(eq(stripeAccountRoutes.stripeAccountId, stripeAccountId));
  return row?.organisationId;
}

export function paymentLinkDto(row: typeof stripePaymentLinks.$inferSelect, appUrl: string): StripePaymentLink {
  return {
    id: row.id, invoiceId: row.invoiceId, status: row.status, amount: row.amount,
    currency: 'NZD', platformFee: row.platformFee,
    payUrl: `${appUrl.replace(/\/$/, '')}/pay/${row.publicToken}`,
    expiresAt: row.expiresAt.toISOString(), createdAt: row.createdAt.toISOString(),
    paymentId: row.paymentId, receiptId: row.receiptId,
  };
}

export async function insertPaymentLink(db: Database, input: {
  id: string; organisationId: string; userId: string; invoiceId: string; publicToken: string;
  idempotencyKey: string; checkoutSessionId: string; checkoutUrl: string; amountCents: number; platformFeeCents: number; expiresAt: Date;
}) {
  const [row] = await db.insert(stripePaymentLinks).values({
    id: input.id, organisationId: input.organisationId, userId: input.userId, invoiceId: input.invoiceId, idempotencyKey: input.idempotencyKey,
    publicToken: input.publicToken, stripeCheckoutSessionId: input.checkoutSessionId,
    checkoutUrl: input.checkoutUrl, amount: centsToMoney(input.amountCents), platformFee: centsToMoney(input.platformFeeCents),
    expiresAt: input.expiresAt,
  }).returning();
  return row;
}

export async function getPaymentLinkByIdempotencyKey(db: Database, organisationId: string, idempotencyKey: string) {
  const [row] = await db.select().from(stripePaymentLinks).where(and(eq(stripePaymentLinks.organisationId, organisationId), eq(stripePaymentLinks.idempotencyKey, idempotencyKey)));
  return row;
}

export async function listPaymentLinks(db: Database, organisationId: string, invoiceId: string) {
  return db.select().from(stripePaymentLinks).where(and(eq(stripePaymentLinks.organisationId, organisationId), eq(stripePaymentLinks.invoiceId, invoiceId))).orderBy(desc(stripePaymentLinks.createdAt));
}

export async function getPaymentLink(db: Database, organisationId: string, id: string) {
  const [row] = await db.select().from(stripePaymentLinks).where(and(eq(stripePaymentLinks.organisationId, organisationId), eq(stripePaymentLinks.id, id)));
  return row;
}

export async function getPaymentLinkByToken(db: Database, token: string) {
  const [row] = await db.select().from(stripePaymentLinks).where(eq(stripePaymentLinks.publicToken, token));
  return row;
}

export async function getPaymentLinkBySession(db: Database, sessionId: string) {
  const [row] = await db.select().from(stripePaymentLinks).where(eq(stripePaymentLinks.stripeCheckoutSessionId, sessionId));
  return row;
}

export async function markLinkPaid(db: Database, organisationId: string, id: string, input: { paymentIntentId: string; paymentId: string; receiptId: string }) {
  await db.update(stripePaymentLinks).set({ status: 'paid', stripePaymentIntentId: input.paymentIntentId, paymentId: input.paymentId, receiptId: input.receiptId, updatedAt: new Date() }).where(and(eq(stripePaymentLinks.organisationId, organisationId), eq(stripePaymentLinks.id, id)));
}

export async function markLinkCancelled(db: Database, organisationId: string, id: string) {
  await db.update(stripePaymentLinks).set({ status: 'cancelled', updatedAt: new Date() }).where(and(eq(stripePaymentLinks.organisationId, organisationId), eq(stripePaymentLinks.id, id)));
}

export async function claimEvent(db: Database, event: { id: string; organisationId: string; type: string; livemode: boolean }) {
  return (await db.insert(stripeEvents).values({ eventId: event.id, organisationId: event.organisationId, eventType: event.type, livemode: event.livemode }).onConflictDoNothing().returning()).length > 0;
}

export async function completeEvent(db: Database, id: string, outcome: 'processed' | 'ignored' | 'failed', error?: string) {
  await db.update(stripeEvents).set({ outcome, error: error ?? null, processedAt: new Date() }).where(eq(stripeEvents.eventId, id));
}
