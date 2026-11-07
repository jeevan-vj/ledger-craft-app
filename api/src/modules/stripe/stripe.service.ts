import type { CreateStripePaymentLinkRequest, StripeAccountStatus, StripePaymentLink } from '@ledgercraft/contracts';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import { withOrganisationTx, type OrganisationContext } from '../auth/bind-organisation';
import { hasPermission } from '../auth/permissions';
import * as profileRepo from '../business-profile/business-profile.repository';
import * as invoicesRepo from '../invoices/invoices.repository';
import { moneyToCents } from '../invoices/money';
import { calculatePlatformFeeCents } from './stripe.fees';
import type { StripeConfig, StripeGateway } from './stripe.gateway';
import * as repo from './stripe.repository';
import { consumeStripeRateLimit } from './stripe.rate-limits';

function requireEnabled(config: StripeConfig | undefined, gateway: StripeGateway | undefined): asserts config is StripeConfig {
  if (!config?.enabled || !gateway) throw new HTTPException(404, { message: 'Card payments are not available' });
}

function stripeCents(value: string): number {
  const cents = moneyToCents(value);
  if (cents <= 0n || cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new HTTPException(400, { message: 'Payment amount is outside Stripe limits' });
  return Number(cents);
}

function contextForUser(db: Database, userId: string) {
  return withOrganisationTx(db, userId, (_tx, ctx) => Promise.resolve(ctx));
}

function requireManage(ctx: OrganisationContext) {
  if (!hasPermission(ctx.role, 'payments.manage')) throw new HTTPException(403, { message: 'Missing permission: payments.manage' });
}

function approved(config: StripeConfig | undefined, organisationId: string) { return config?.enabled === true && (config.mock === true || config.approvedOrganisationIds?.includes(organisationId) === true); }
function accountWithApproval(row: Awaited<ReturnType<typeof repo.getConnectedAccount>>, organisationId: string, config?: StripeConfig) { return { ...repo.accountDto(row), paymentsApproved: approved(config, organisationId) }; }

export async function getAccount(db: Database, userId: string, config?: StripeConfig): Promise<StripeAccountStatus> {
  return withOrganisationTx(db, userId, async (tx, ctx) => accountWithApproval(await repo.getConnectedAccount(tx, ctx.organisationId), ctx.organisationId, config));
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
  if (data.existing) return accountWithApproval(data.existing, data.ctx.organisationId, config);
  const remote = await gateway!.createConnectedAccount({ country: 'NZ', organisationId: data.ctx.organisationId, businessName: data.profile.name, email: data.profile.email, idempotencyKey });
  return accountWithApproval(await db.transaction((tx) => repo.upsertConnectedAccount(tx, data.ctx, remote)), data.ctx.organisationId, config);
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
  return accountWithApproval(await db.transaction((tx) => repo.upsertConnectedAccount(tx, data.ctx, remote)), data.ctx.organisationId, config);
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
    if (account?.status !== 'active') throw new HTTPException(409, { message: 'Stripe onboarding must be active before accepting payments' });
    return { ctx, invoice, account };
  });
  if (!approved(config, data.ctx.organisationId)) throw new HTTPException(403, { message: 'Card payments for this company await beta approval. Contact the platform owner before creating a payment link.' });
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
  await consumeStripeRateLimit(db, 'payment-link-create', `${data.ctx.organisationId}:${userId}`, 10, 60_000);
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
    if (row?.invoiceId !== invoiceId) throw new HTTPException(404, { message: 'Payment link not found' });
    return repo.paymentLinkDto(row, appUrl);
  });
}

export async function cancelPaymentLink(db: Database, userId: string, invoiceId: string, id: string, gateway: StripeGateway | undefined, config: StripeConfig | undefined) {
  requireEnabled(config, gateway);
  const row = await withOrganisationTx(db, userId, async (tx, ctx) => {
    const row = await repo.getPaymentLink(tx, ctx.organisationId, id);
    if (row?.invoiceId !== invoiceId) throw new HTTPException(404, { message: 'Payment link not found' });
    if (row.status !== 'open') return row;
    return row;
  });
  if (row.status === 'open') {
    await gateway!.expireCheckoutSession(row.stripeCheckoutSessionId);
    await db.transaction((tx) => repo.markLinkCancelled(tx, row.organisationId, row.id));
  }
  return repo.paymentLinkDto((await repo.getPaymentLink(db, row.organisationId, row.id))!, config.appUrl);
}

export async function publicPaymentRedirect(db: Database, token: string, config?: StripeConfig): Promise<Response> {
  const row = await repo.getPaymentLinkByToken(db, token);
  if (!row) return Response.json({ status: 'not_found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  await consumeStripeRateLimit(db, 'public-payment-link', row.id, 60, 60_000);
  if (row.status !== 'open') return Response.json({ status: row.status }, { status: 410, headers: { 'Cache-Control': 'no-store' } });
  const invoice = await invoicesRepo.getInvoice(db, row.organisationId, row.invoiceId);
  const account = await repo.getConnectedAccount(db, row.organisationId);
  if (!approved(config, row.organisationId) || !invoice || invoice.status === 'cancelled' || account?.status !== 'active' || moneyToCents(invoice.balanceDue) < moneyToCents(row.amount)) {
    await db.transaction(tx => repo.markLinkCancelled(tx, row.organisationId, row.id));
    return Response.json({ status: 'cancelled' }, { status: 410, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  }
  if (row.expiresAt.getTime() <= Date.now()) return Response.json({ status: 'expired' }, { status: 410, headers: { 'Cache-Control': 'no-store' } });
  return new Response(null, { status: 302, headers: { Location: row.checkoutUrl, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}

export { processVerifiedWebhook, resolveWebhookEvent } from './stripe.webhooks';
