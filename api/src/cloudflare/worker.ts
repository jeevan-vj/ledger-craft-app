import { DurableObject } from 'cloudflare:workers';
import * as Sentry from '@sentry/cloudflare';
import type { CloudflareOptions } from '@sentry/cloudflare';
import { eq } from 'drizzle-orm';
import { createApp } from '../app';
import { organisationMemberships, organisations, users } from '../db/schema/identity';
import { createAuth, type Auth } from '../modules/auth/auth';
import { createUnavailableInvoiceMailer } from '../modules/invoices/mailer';
import { bindRequestId, failureResponse, resolveRequestId } from '../observability/request-id';
import { reportUnhandledError, setErrorReporter, type ErrorReport } from '../observability/report';
import { toRouteTemplate } from '../observability/scrub';
import { isSentryDebugRouteEnabled, SENTRY_DEBUG_PATH, sentrySdkOptions } from '../observability/sentry-options';
import { createSentryReporter, tagActiveRequest } from '../observability/sentry-reporter';
import { publicLedgerOrganisationId } from './public-routes';
import { durableDatabase, durableObjectStore, migrateStorage } from './storage';

setErrorReporter(createSentryReporter());

interface Env {
  IDENTITY: DurableObjectNamespace<IdentityBase>;
  LEDGERS: DurableObjectNamespace<LedgerBase>;
  BETTER_AUTH_SECRET: string;
  NODE_ENV?: string;
  SENTRY_DSN?: string;
  SENTRY_TRACES_SAMPLE_RATE?: string;
  SENTRY_ENVIRONMENT?: string;
  SENTRY_RELEASE?: string;
  SENTRY_DEBUG_ROUTE?: string;
  CF_VERSION_METADATA?: WorkerVersionMetadata;
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

/** Identity coordinates unique emails and sessions; business data lives in separate organisation objects. */
class IdentityBase extends DurableObject<Env> {
  private db;
  private auth: Auth;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => migrateStorage(ctx.storage));
    this.db = durableDatabase(ctx.storage);
    this.auth = createAuth(this.db);
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
      if (path === '/api/healthz' || path === '/api/readyz') {
        this.ctx.storage.sql.exec('SELECT 1').toArray();
        const applied = this.ctx.storage.sql.exec<{name:string}>('SELECT name FROM _migrations ORDER BY name DESC LIMIT 1').toArray()[0];
        return Response.json({status:'ok'}, {headers:{'X-Ledgercraft-Migration':applied?.name ?? 'none'}});
      }
      const session = await this.auth.api.getSession({headers:request.headers});
      if (!session) return failureResponse(401, 'UNAUTHORIZED', 'Unauthorized', requestId);
      const [member] = await this.db.select().from(organisationMemberships).where(eq(organisationMemberships.userId, session.user.id));
      if (!member) return failureResponse(403, 'FORBIDDEN', 'No organisation membership', requestId);
      const [org] = await this.db.select().from(organisations).where(eq(organisations.id, member.organisationId));
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
      // RPC arguments originate only in this Worker. Public HTTP headers cannot select a user or organisation.
      if (identity) {
        await this.db.transaction(async (db) => {
          await db.insert(users).values(identity.user).onConflictDoNothing();
          await db.insert(organisations).values(identity.organisation).onConflictDoNothing();
          await db.insert(organisationMemberships).values({id:identity.membership.id, userId:identity.user.id, organisationId:identity.organisation.id, role:identity.membership.role}).onConflictDoNothing();
        });
      } else if (!publicLedgerOrganisationId(path)) {
        return failureResponse(401, 'UNAUTHORIZED', 'Unauthorized', requestId);
      }
      const sessionAuth = identity ? { api: {getSession: async () => ({user:identity.user})} } as unknown as Auth : undefined;
      const app = createApp({
        db:this.db,
        auth:sessionAuth,
        objectStore:durableObjectStore(this.ctx.storage),
        invoiceMailer:createUnavailableInvoiceMailer(),
        actorUserId: userId,
      });
      return app.fetch(request);
    } catch (error) {
      return reportFailure(error, report);
    }
  }
}

export const Identity = Sentry.instrumentDurableObjectWithSentry(sentryOptions, IdentityBase);
export const Ledger = Sentry.instrumentDurableObjectWithSentry(sentryOptions, LedgerBase);

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
