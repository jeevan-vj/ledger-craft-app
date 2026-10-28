import type { CreateStripePaymentLinkRequest, StripeAccountStatus, StripePaymentLink } from '@ledgercraft/contracts';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import { withOrganisationTx, type OrganisationContext } from '../auth/bind-organisation';
import { hasPermission } from '../auth/permissions';
import * as profileRepo from '../business-profile/business-profile.repository';
import * as invoicesRepo from '../invoices/invoices.repository';
import { moneyToCents } from '../invoices/money';
import { createPaymentInTx } from '../payments/payments.service';
import { createReceiptInTx } from '../receipts/receipts.service';
import { calculatePlatformFeeCents } from './stripe.fees';
import type { StripeConfig, StripeGateway, StripeWebhookEvent } from './stripe.gateway';
import * as repo from './stripe.repository';

function requireEnabled(config: StripeConfig | undefined, gateway: StripeGateway | undefined): asserts config is StripeConfig {
  if (!config?.enabled || !gateway) throw new HTTPException(404, { message: 'Card payments are not available' });
}

function stripeCents(value: string): number {
  const cents = moneyToCents(value);
  if (cents <= 0n || cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new HTTPException(400, { message: 'Payment amount is outside Stripe limits' });
  return Number(cents);
}

async function contextForUser(db: Database, userId: string) {
  return withOrganisationTx(db, userId, async (_tx, ctx) => ctx);
}

function requireManage(ctx: OrganisationContext) {
  if (!hasPermission(ctx.role, 'payments.manage')) throw new HTTPException(403, { message: 'Missing permission: payments.manage' });
}

export async function getAccount(db: Database, userId: string): Promise<StripeAccountStatus> {
  return withOrganisationTx(db, userId, async (tx, ctx) => repo.accountDto(await repo.getConnectedAccount(tx, ctx.organisationId)));
}

export async function createAccount(db: Database, userId: string, gateway: StripeGateway | undefined, config: StripeConfig | undefined, idempotencyKey: string) {
  requireEnabled(config, gateway);
  const data = await withOrganisationTx(db, userId, async (tx, ctx) => {
    requireManage(ctx);
    const existing = await repo.getConnectedAccount(tx, ctx.organisationId);
    const profile = await profileRepo.getBusinessProfile(tx, ctx.organisationId);
    if (!profile) throw new HTTPException(400, { message: 'Set up your business profile first' });
    return { ctx, existing, profile };
  });
  if (data.existing) return repo.accountDto(data.existing);
  const remote = await gateway!.createConnectedAccount({ country: 'NZ', organisationId: data.ctx.organisationId, businessName: data.profile.name, email: data.profile.email, idempotencyKey });
  return repo.accountDto(await db.transaction((tx) => repo.upsertConnectedAccount(tx, data.ctx, remote)));
}

export async function refreshAccount(db: Database, userId: string, gateway: StripeGateway | undefined, config: StripeConfig | undefined) {
  requireEnabled(config, gateway);
  const data = await withOrganisationTx(db, userId, async (tx, ctx) => {
    requireManage(ctx);
    const existing = await repo.getConnectedAccount(tx, ctx.organisationId);
    if (!existing) throw new HTTPException(409, { message: 'Connect a Stripe account first' });
    return { ctx, existing };
  });
  const remote = await gateway!.retrieveConnectedAccount(data.existing.stripeAccountId);
  return repo.accountDto(await db.transaction((tx) => repo.upsertConnectedAccount(tx, data.ctx, remote)));
}

export async function createOnboardingLink(db: Database, userId: string, gateway: StripeGateway | undefined, config: StripeConfig | undefined) {
  requireEnabled(config, gateway);
  const { existing } = await withOrganisationTx(db, userId, async (tx, ctx) => {
    requireManage(ctx);
    const existing = await repo.getConnectedAccount(tx, ctx.organisationId);
    if (!existing) throw new HTTPException(409, { message: 'Connect a Stripe account first' });
    return { existing };
  });
  const link = await gateway!.createAccountLink({
    accountId: existing.stripeAccountId,
    returnUrl: `${config.appUrl.replace(/\/$/, '')}/settings?tab=payments&stripe=return`,
    refreshUrl: `${config.appUrl.replace(/\/$/, '')}/settings?tab=payments&stripe=refresh`,
  });
  return { url: link.url, expiresAt: new Date(link.expiresAt * 1000).toISOString() };
}

export async function createPaymentLink(db: Database, userId: string, invoiceId: string, input: CreateStripePaymentLinkRequest, gateway: StripeGateway | undefined, config: StripeConfig | undefined, idempotencyKey: string): Promise<StripePaymentLink> {
  requireEnabled(config, gateway);
  const data = await withOrganisationTx(db, userId, async (tx, ctx) => {
    const invoice = await invoicesRepo.getInvoice(tx, ctx.organisationId, invoiceId);
    if (!invoice) throw new HTTPException(404, { message: 'Invoice not found' });
    const account = await repo.getConnectedAccount(tx, ctx.organisationId);
    if (!account || account.status !== 'active') throw new HTTPException(409, { message: 'Stripe onboarding must be active before accepting payments' });
    return { ctx, invoice, account };
  });
  if (data.invoice.currency !== 'NZD') throw new HTTPException(400, { message: 'Stripe payments currently require an NZD invoice' });
  if (data.invoice.paymentStatus === 'cancelled' || data.invoice.balanceDue === '0.00') throw new HTTPException(409, { message: 'This invoice cannot accept another payment' });
  const amountCents = stripeCents(input.amount ?? data.invoice.balanceDue);
  const replay = await repo.getPaymentLinkByIdempotencyKey(db, data.ctx.organisationId, idempotencyKey);
  if (replay) {
    if (replay.invoiceId !== invoiceId || moneyToCents(replay.amount) !== BigInt(amountCents)) throw new HTTPException(409, { message: 'Idempotency key was already used for another payment link request' });
    return repo.paymentLinkDto(replay, config.appUrl);
  }
  if (amountCents < 50) throw new HTTPException(400, { message: 'Stripe requires a minimum NZD 0.50 payment' });
  if (BigInt(amountCents) > moneyToCents(data.invoice.balanceDue)) throw new HTTPException(400, { message: 'Payment exceeds invoice balance' });
  const platformFeeCents = calculatePlatformFeeCents(amountCents, { basisPoints: config.platformFeeBasisPoints, fixedCents: config.platformFeeFixedCents });
  const id = crypto.randomUUID();
  const publicToken = `${data.ctx.organisationId}_${crypto.randomUUID()}`;
  const remote = await gateway!.createCheckoutSession({
    paymentLinkId: id, organisationId: data.ctx.organisationId, connectedAccountId: data.account.stripeAccountId,
    invoiceNumber: data.invoice.invoiceNumber, amountCents, platformFeeCents,
    successUrl: `${config.appUrl.replace(/\/$/, '')}/pay/${publicToken}?status=success`,
    cancelUrl: `${config.appUrl.replace(/\/$/, '')}/pay/${publicToken}?status=cancelled`,
  }, idempotencyKey);
  const row = await db.transaction((tx) => repo.insertPaymentLink(tx, {
    id, organisationId: data.ctx.organisationId, userId: data.ctx.userId, invoiceId, idempotencyKey,
    publicToken, checkoutSessionId: remote.id, checkoutUrl: remote.url,
    amountCents, platformFeeCents, expiresAt: new Date(remote.expiresAt * 1000),
  }));
  return repo.paymentLinkDto(row, config.appUrl);
}

export async function listPaymentLinks(db: Database, userId: string, invoiceId: string, appUrl: string) {
  return withOrganisationTx(db, userId, async (tx, ctx) => ({ items: (await repo.listPaymentLinks(tx, ctx.organisationId, invoiceId)).map((row) => repo.paymentLinkDto(row, appUrl)) }));
}

export async function getPaymentLink(db: Database, userId: string, invoiceId: string, id: string, appUrl: string) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const row = await repo.getPaymentLink(tx, ctx.organisationId, id);
    if (!row || row.invoiceId !== invoiceId) throw new HTTPException(404, { message: 'Payment link not found' });
    return repo.paymentLinkDto(row, appUrl);
  });
}

export async function cancelPaymentLink(db: Database, userId: string, invoiceId: string, id: string, gateway: StripeGateway | undefined, config: StripeConfig | undefined) {
  requireEnabled(config, gateway);
  const row = await withOrganisationTx(db, userId, async (tx, ctx) => {
    const row = await repo.getPaymentLink(tx, ctx.organisationId, id);
    if (!row || row.invoiceId !== invoiceId) throw new HTTPException(404, { message: 'Payment link not found' });
    if (row.status !== 'open') return row;
    return row;
  });
  if (row.status === 'open') {
    await gateway!.expireCheckoutSession(row.stripeCheckoutSessionId);
    await db.transaction((tx) => repo.markLinkCancelled(tx, row.organisationId, row.id));
  }
  return repo.paymentLinkDto((await repo.getPaymentLink(db, row.organisationId, row.id))!, config.appUrl);
}

export async function publicPaymentRedirect(db: Database, token: string): Promise<Response> {
  const row = await repo.getPaymentLinkByToken(db, token);
  if (!row) return Response.json({ status: 'not_found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  if (row.status !== 'open') return Response.json({ status: row.status }, { status: 410, headers: { 'Cache-Control': 'no-store' } });
  if (row.expiresAt.getTime() <= Date.now()) return Response.json({ status: 'expired' }, { status: 410, headers: { 'Cache-Control': 'no-store' } });
  return new Response(null, { status: 302, headers: { Location: row.checkoutUrl, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}

function stringField(value: unknown): string | undefined { return typeof value === 'string' ? value : undefined; }
function numberField(value: unknown): number | undefined { return typeof value === 'number' ? value : undefined; }

export async function processWebhook(db: Database, event: StripeWebhookEvent, config: StripeConfig) {
  if (event.livemode !== (config.mode === 'live')) throw new HTTPException(400, { message: 'Stripe event mode does not match this environment' });
  if (event.type !== 'checkout.session.completed' && event.type !== 'checkout.session.async_payment_succeeded') return { received: true as const };
  const object = event.data.object;
  const metadata = object.metadata && typeof object.metadata === 'object' ? object.metadata as Record<string, unknown> : {};
  const organisationId = stringField(metadata.organisation_id);
  const linkId = stringField(metadata.payment_link_id);
  const sessionId = stringField(object.id);
  const paymentIntentId = stringField(object.payment_intent);
  const amountTotal = numberField(object.amount_total);
  if (!organisationId || !linkId || !sessionId || !paymentIntentId || amountTotal === undefined || object.currency !== 'nzd' || object.payment_status !== 'paid') {
    throw new HTTPException(400, { message: 'Stripe Checkout event is incomplete or unpaid' });
  }
  await db.transaction(async (tx) => {
    if (!await repo.claimEvent(tx, { id: event.id, organisationId, type: event.type, livemode: event.livemode })) return;
    const link = await repo.getPaymentLinkBySession(tx, sessionId);
    if (!link || link.id !== linkId || link.organisationId !== organisationId || moneyToCents(link.amount) !== BigInt(amountTotal)) {
      await repo.completeEvent(tx, event.id, 'failed', 'Payment link integrity check failed');
      throw new HTTPException(400, { message: 'Stripe payment did not match the local payment link' });
    }
    if (link.status === 'paid') { await repo.completeEvent(tx, event.id, 'ignored'); return; }
    const payment = await createPaymentInTx(tx, { organisationId, userId: link.userId, role: 'owner' }, {
      invoiceId: link.invoiceId, paymentMethod: 'online', amount: link.amount,
      paymentDate: new Date().toISOString().slice(0, 10), referenceNumber: paymentIntentId,
      notes: 'Paid through Stripe Checkout',
    }, undefined, { clearingAccountNumber: '1130' });
    const receipt = await createReceiptInTx(
      tx,
      { organisationId, userId: link.userId },
      { paymentId: payment.id },
      { provider: 'stripe', paymentIntentId, checkoutSessionId: sessionId },
    );
    await repo.markLinkPaid(tx, organisationId, link.id, { paymentIntentId, paymentId: payment.id, receiptId: receipt.id });
    await repo.completeEvent(tx, event.id, 'processed');
  });
  return { received: true as const };
}

export async function processVerifiedWebhook(db: Database, event: StripeWebhookEvent, gateway: StripeGateway, config: StripeConfig) {
  if (event.type === 'account.updated') {
    const object = event.data.object;
    const metadata = object.metadata && typeof object.metadata === 'object' ? object.metadata as Record<string, unknown> : {};
    const organisationId = stringField(metadata.organisation_id);
    const accountId = stringField(object.id) ?? event.account ?? undefined;
    if (!organisationId || !accountId) throw new HTTPException(400, { message: 'Stripe account event is missing routing metadata' });
    const current = await repo.getConnectedAccount(db, organisationId);
    if (!current || current.stripeAccountId !== accountId) throw new HTTPException(400, { message: 'Unknown Stripe connected account' });
    const remote = await gateway.retrieveConnectedAccount(accountId);
    await db.transaction((tx) => repo.upsertConnectedAccount(tx, { organisationId, userId: current.userId }, remote));
    return { received: true as const };
  }
  return processWebhook(db, event, config);
}

export async function resolveWebhookEvent(db: Database, payload: Uint8Array, signature: string, kind: 'platform' | 'connect', gateway: StripeGateway | undefined, config: StripeConfig | undefined) {
  requireEnabled(config, gateway);
  let event: StripeWebhookEvent;
  try {
    event = await gateway!.constructWebhookEvent(payload, signature, kind === 'platform' ? config.webhookSecret : config.connectWebhookSecret);
  } catch {
    throw new HTTPException(400, { message: 'Invalid Stripe webhook signature' });
  }
  return processVerifiedWebhook(db, event, gateway!, config);
}
