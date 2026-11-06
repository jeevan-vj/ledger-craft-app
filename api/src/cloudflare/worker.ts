import { DurableObject } from 'cloudflare:workers';
import * as Sentry from '@sentry/cloudflare';
import type { CloudflareOptions } from '@sentry/cloudflare';
import { and, eq, isNull } from 'drizzle-orm';
import { createApp } from '../app';
import { activeOrganisationSelections, organisationMemberships, organisations, users } from '../db/schema/identity';
import { createAuth, type Auth } from '../modules/auth/auth';
import { createAuthEmailSender } from '../modules/auth/auth-email';
import { createInvoiceMailerFromEnv } from '../modules/invoices/resend';
import { bindRequestId, failureResponse, resolveRequestId } from '../observability/request-id';
import { reportUnhandledError, setErrorReporter, type ErrorReport } from '../observability/report';
import { toRouteTemplate } from '../observability/scrub';
import { isSentryDebugRouteEnabled, SENTRY_DEBUG_PATH, sentrySdkOptions } from '../observability/sentry-options';
import { createSentryReporter, tagActiveRequest } from '../observability/sentry-reporter';
import { publicLedgerOrganisationId } from './public-routes';
import { durableDatabase, durableFileStorage, durableObjectStore, migrateStorage } from './storage';
import { createR2FileStorage } from '../modules/storage/r2-file-storage';
import { runDue } from '../modules/recurring/recurring.service';
import { createOpenAiChatCompleter, createOpenAiReceiptScanner } from '../modules/ai/openai';
import { createExtractionProvider } from '../modules/invoice-imports/extraction';
import type { WorkersAiBinding } from '../modules/ai/workers-ai';
import { stripePaymentsCapability, stripeRuntimeFromEnv } from '../modules/stripe/stripe.real-gateway';
import { processVerifiedWebhook } from '../modules/stripe/stripe.service';
import type { StripeWebhookEvent } from '../modules/stripe/stripe.gateway';
import { AccountPurgeGate, purgeLedgerAccountData, runRecurringAlarm } from './account-purge';

setErrorReporter(createSentryReporter());

export interface Env {
  IDENTITY: DurableObjectNamespace<IdentityBase>;
  LEDGERS: DurableObjectNamespace<LedgerBase>;
  BETTER_AUTH_SECRET: string;
  OPENAI_API_KEY?: string;
  XAI_API_KEY?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
  BETTER_AUTH_URL?: string;
  NODE_ENV?: string;
  APP_ENV?: string;
  INVOICE_IMPORT_AI_PROVIDER?: string;
  WORKERS_AI_MODEL?: string;
  AI?: WorkersAiBinding;
  SENTRY_DSN?: string;
  SENTRY_TRACES_SAMPLE_RATE?: string;
  SENTRY_ENVIRONMENT?: string;
  SENTRY_RELEASE?: string;
  SENTRY_DEBUG_ROUTE?: string;
  STRIPE_PAYMENTS_ENABLED?: string;
  STRIPE_MOCK_MODE?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_CONNECT_WEBHOOK_SECRET?: string;
  STRIPE_PLATFORM_FEE_BPS?: string;
  STRIPE_PLATFORM_FEE_FIXED_CENTS?: string;
  APP_URL?: string;
  CF_VERSION_METADATA?: WorkerVersionMetadata;
  /** Optional Phase 1 binding. Wrangler keeps it disabled until the bucket exists. */
  DOCUMENTS?: R2Bucket;
}
type IdentityContext = {
  user: { id: string; name: string; email: string; emailVerified: boolean };
  organisation: { id: string; name: string };
  membership: { id: string; role: string };
};

const unavailable = 'Service temporarily unavailable. Please try again later.';

function sentryOptions(env: Env): CloudflareOptions {
  return sentrySdkOptions(env) as CloudflareOptions;
}

function reportFailure(error: unknown, report: ErrorReport): Response {
  reportUnhandledError(error, report);
  return failureResponse(503, 'SERVICE_UNAVAILABLE', unavailable, report.requestId);
}

function isIdentityHealthPath(path: string): boolean {
  return path === '/api/healthz' || path === '/api/readyz';
}

function identityHealthResponse(storage: DurableObjectState['storage'], env: Env, path: string): Response {
  storage.sql.exec('SELECT 1').toArray();
  const applied = storage.sql.exec<{name:string}>('SELECT name FROM _migrations ORDER BY name DESC LIMIT 1').toArray()[0];
  const capabilities = {
    email: env.RESEND_API_KEY?.trim() && env.RESEND_FROM?.trim() ? 'available' : 'unavailable',
    ai: env.OPENAI_API_KEY?.trim() || env.XAI_API_KEY?.trim() || env.AI ? 'available' : 'unavailable',
    stripe: stripePaymentsCapability(env as unknown as Record<string, string | undefined>),
  };
  const body = path === '/api/healthz' ? { status: 'ok', capabilities } : { status: 'ok' };
  return Response.json(body, { headers: { 'X-Ledgercraft-Migration': applied?.name ?? 'none' } });
}

function isIdentityApplicationPath(path: string): boolean {
  return path === '/api/me'
    || path.startsWith('/api/me/')
    || path.startsWith('/api/organisations')
    || path.startsWith('/api/invitations');
}

/** Identity coordinates unique emails and sessions; business data lives in separate organisation objects. */
class IdentityBase extends DurableObject<Env> {
  private db;
  private auth: Auth;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => migrateStorage(ctx.storage));
    this.db = durableDatabase(ctx.storage);
    this.auth = createAuth(this.db, { sendAuthEmail: createAuthEmailSender(env) });
  }
  async dispatch(request: Request): Promise<Response> {
    const requestId = resolveRequestId(request.headers.get('x-request-id'));
    const path = new URL(request.url).pathname;
    const route = toRouteTemplate(path);
    const report = { source: 'identity' as const, requestId, route };
    try {
      tagActiveRequest(report);
      if (path.startsWith('/api/auth/')) {
        try {
          return await this.auth.handler(request);
        } catch (error) {
          return reportFailure(error, { ...report, source: 'better-auth', route: toRouteTemplate(path) });
        }
      }
      if (isIdentityHealthPath(path)) {
        return identityHealthResponse(this.ctx.storage, this.env, path);
      }
      const session = await this.auth.api.getSession({headers:request.headers});
      if (!session) return failureResponse(401, 'UNAUTHORIZED', 'Unauthorized', requestId);
      if (isIdentityApplicationPath(path)) {
        return createApp({
          db: this.db,
          auth: this.auth,
          purgeOrganisation: async (organisationId) => this.env.LEDGERS.getByName(organisationId).purgeAccountData(organisationId),
          removeOrganisationMembership: async (organisationId, userId) => this.env.LEDGERS.getByName(organisationId).removeAccountMembership(userId),
        }).fetch(request);
      }
      const memberships = await this.db.select({ membership: organisationMemberships, organisation: organisations })
        .from(organisationMemberships)
        .innerJoin(organisations, eq(organisations.id, organisationMemberships.organisationId))
        .where(and(eq(organisationMemberships.userId, session.user.id), isNull(organisationMemberships.removedAt), isNull(organisations.archivedAt)));
      const [selection] = await this.db.select().from(activeOrganisationSelections).where(eq(activeOrganisationSelections.userId, session.user.id));
      const member = memberships.find((row) => row.membership.organisationId === selection?.organisationId)?.membership ?? memberships[0]?.membership;
      if (!member) return failureResponse(403, 'FORBIDDEN', 'No organisation membership', requestId);
      const org = memberships.find((row) => row.organisation.id === member.organisationId)?.organisation;
      if (!org) return failureResponse(403, 'FORBIDDEN', 'Organisation not found', requestId);
      return this.env.LEDGERS.getByName(org.id).dispatch(request, {
        user:session.user, organisation:org, membership:member,
      });
    } catch (error) {
      return reportFailure(error, report);
    }
  }
}

class LedgerBase extends DurableObject<Env> {
  private db;
  private readonly accountPurgeGate = new AccountPurgeGate();
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => migrateStorage(ctx.storage));
    this.db = durableDatabase(ctx.storage);
  }
  async dispatch(request: Request, identity?: IdentityContext): Promise<Response> {
    const requestId = resolveRequestId(request.headers.get('x-request-id'));
    const path = new URL(request.url).pathname;
    const route = toRouteTemplate(path);
    const userId = identity?.user.id;
    const report = { source: 'ledger' as const, requestId, route, userId };
    try {
      tagActiveRequest(report);
      // deleteAll removes the live SQLite database. Keep a warm, already-purged
      // instance from querying those deleted tables before Cloudflare evicts it.
      if (this.accountPurgeGate.isPurged) return failureResponse(404, 'NOT_FOUND', 'Not found', requestId);
      // RPC arguments originate only in this Worker. Public HTTP headers cannot select a user or organisation.
      if (identity) {
        await this.db.transaction(async (db) => {
          await db.insert(users).values(identity.user).onConflictDoNothing();
          await db.insert(organisations).values(identity.organisation).onConflictDoNothing();
          await db.insert(organisationMemberships).values({id:identity.membership.id, userId:identity.user.id, organisationId:identity.organisation.id, role:identity.membership.role})
            .onConflictDoUpdate({ target: [organisationMemberships.organisationId, organisationMemberships.userId], set: { role: identity.membership.role, removedAt: null } });
        });
      } else if (!publicLedgerOrganisationId(path)) {
        return failureResponse(401, 'UNAUTHORIZED', 'Unauthorized', requestId);
      }
      const sessionAuth = identity ? { api: {getSession: async () => ({user:identity.user})} } as unknown as Auth : undefined;
      const stripe = stripeRuntimeFromEnv(this.env as unknown as Record<string, string | undefined>);
      const invoiceMailer = createInvoiceMailerFromEnv(this.env);
      const receiptScanner = this.env.OPENAI_API_KEY || this.env.XAI_API_KEY || this.env.AI ? createOpenAiReceiptScanner({ env: this.env }) : undefined;
      const app = createApp({
        db:this.db,
        auth:sessionAuth,
        objectStore:durableObjectStore(this.ctx.storage),
        fileStorage:this.env.DOCUMENTS
          ? createR2FileStorage(this.env.DOCUMENTS)
          : durableFileStorage(this.ctx.storage),
        invoiceMailer,
        receiptScanner,
        workersAi: this.env.AI,
        capabilities: {
          email: invoiceMailer.availability ?? 'unavailable',
          ai: receiptScanner ? 'available' : 'unavailable',
          stripe: stripePaymentsCapability(this.env as unknown as Record<string, string | undefined>),
        },
        chatCompleter: this.env.OPENAI_API_KEY || this.env.XAI_API_KEY ? createOpenAiChatCompleter({ env: this.env }) : undefined,
        invoiceImportExtractor: {
          extractDocument: (file, context) => createExtractionProvider({ env: this.env }).extractDocument(file, context),
        },
        actorUserId: userId,
        scheduleRecurringAlarm: async (timestamp) => this.accountPurgeGate.scheduleAlarm(() => this.ctx.storage.setAlarm(timestamp)),
        stripeGateway: stripe?.gateway,
        stripeConfig: stripe?.config,
      });
      return app.fetch(request);
    } catch (error) {
      return reportFailure(error, report);
    }
  }

  async stripeWebhook(event: StripeWebhookEvent): Promise<{ received: true }> {
    const stripe = stripeRuntimeFromEnv(this.env as unknown as Record<string, string | undefined>);
    if (!stripe) throw new Error('Stripe payments are not enabled');
    return processVerifiedWebhook(this.db, event, stripe.gateway, stripe.config);
  }

  async purgeAccountData(organisationId: string): Promise<void> {
    await purgeLedgerAccountData(this.ctx.storage, this.env.DOCUMENTS, organisationId, this.accountPurgeGate);
  }

  async removeAccountMembership(userId: string): Promise<void> {
    await this.db.delete(organisationMemberships).where(eq(organisationMemberships.userId, userId));
  }

  async alarm(): Promise<void> {
    await runRecurringAlarm(
      this.accountPurgeGate,
      () => runDue(this.db, new Date(), 100, undefined, createInvoiceMailerFromEnv(this.env)),
      (timestamp) => this.ctx.storage.setAlarm(timestamp),
    );
  }
}

export const Identity = Sentry.instrumentDurableObjectWithSentry(sentryOptions, IdentityBase);
export const Ledger = Sentry.instrumentDurableObjectWithSentry(sentryOptions, LedgerBase);

async function dispatchStripeWebhook(request: Request, env: Env, path: string, requestId: string): Promise<Response> {
  const stripe = stripeRuntimeFromEnv(env as unknown as Record<string, string | undefined>);
  if (!stripe) return failureResponse(404, 'NOT_FOUND', 'Not found', requestId);
  const signature = request.headers.get('stripe-signature');
  if (!signature) return failureResponse(400, 'VALIDATION_ERROR', 'Missing Stripe signature', requestId);
  let event: StripeWebhookEvent;
  try {
    const secret = path.endsWith('/connect') ? stripe.config.connectWebhookSecret : stripe.config.webhookSecret;
    event = await stripe.gateway.constructWebhookEvent(new Uint8Array(await request.arrayBuffer()), signature, secret);
  } catch {
    return failureResponse(400, 'VALIDATION_ERROR', 'Invalid Stripe webhook signature', requestId);
  }
  const rawMetadata = event.data.object.metadata;
  const metadata = rawMetadata && typeof rawMetadata === 'object' ? rawMetadata as Record<string, unknown> : undefined;
  const organisationId = typeof metadata?.organisation_id === 'string' ? metadata.organisation_id : undefined;
  if (!organisationId) return failureResponse(400, 'VALIDATION_ERROR', 'Stripe event is missing organisation routing metadata', requestId);
  return Response.json(await env.LEDGERS.getByName(organisationId).stripeWebhook(event));
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const bound = bindRequestId(request);
    const path = new URL(bound.request.url).pathname;
    const route = toRouteTemplate(path);
    const report = { source: 'worker' as const, requestId: bound.requestId, route };
    try {
      tagActiveRequest(report);
      if (isSentryDebugRouteEnabled(env) && path === SENTRY_DEBUG_PATH) {
        throw new Error('Sentry verification error');
      }
      if (path === '/api/stripe/webhooks/platform' || path === '/api/stripe/webhooks/connect') {
        return dispatchStripeWebhook(bound.request, env, path, bound.requestId);
      }
      const publicOrganisationId = publicLedgerOrganisationId(path);
      if (publicOrganisationId) return await env.LEDGERS.getByName(publicOrganisationId).dispatch(bound.request);
      if (path.startsWith('/api/')) return await env.IDENTITY.getByName('identity-v1').dispatch(bound.request);
      return failureResponse(404, 'NOT_FOUND', 'Not found', bound.requestId);
    } catch (error) {
      return reportFailure(error, report);
    }
  },
} satisfies ExportedHandler<Env>;

export default Sentry.withSentry(sentryOptions, worker);
