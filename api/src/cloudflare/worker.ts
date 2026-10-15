import { DurableObject } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { createApp } from '../app';
import { createAuth, type Auth } from '../modules/auth/auth';
import { createUnavailableInvoiceMailer } from '../modules/invoices/mailer';
import { organisationMemberships, organisations, users } from '../db/schema/identity';
import { durableDatabase, durableObjectStore, migrateStorage } from './storage';

interface Env {
  IDENTITY: DurableObjectNamespace<Identity>;
  LEDGERS: DurableObjectNamespace<Ledger>;
  BETTER_AUTH_SECRET: string;
}
type IdentityContext = {
  user: { id: string; name: string; email: string; emailVerified: boolean };
  organisation: { id: string; name: string };
  membership: { id: string; role: string };
};
function failure(status: number, code: string, message: string) {
  return Response.json({error:{code, message, requestId:crypto.randomUUID()}}, {status});
}

/** Identity coordinates unique emails and sessions; business data lives in separate organisation objects. */
export class Identity extends DurableObject<Env> {
  private db;
  private auth: Auth;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => migrateStorage(ctx.storage));
    this.db = durableDatabase(ctx.storage);
    this.auth = createAuth(this.db);
  }
  async dispatch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path.startsWith('/api/auth/')) return this.auth.handler(request);
    if (path === '/api/healthz' || path === '/api/readyz') {
      this.ctx.storage.sql.exec('SELECT 1').toArray();
      const applied = this.ctx.storage.sql.exec<{name:string}>('SELECT name FROM _migrations ORDER BY name DESC LIMIT 1').toArray()[0];
      return Response.json({status:'ok'}, {headers:{'X-Ledgercraft-Migration':applied?.name ?? 'none'}});
    }
    const session = await this.auth.api.getSession({headers:request.headers});
    if (!session) return failure(401, 'UNAUTHORIZED', 'Unauthorized');
    const [member] = await this.db.select().from(organisationMemberships).where(eq(organisationMemberships.userId, session.user.id));
    if (!member) return failure(403, 'FORBIDDEN', 'No organisation membership');
    const [org] = await this.db.select().from(organisations).where(eq(organisations.id, member.organisationId));
    if (!org) return failure(403, 'FORBIDDEN', 'Organisation not found');
    return this.env.LEDGERS.getByName(org.id).dispatch(request, {
      user:session.user, organisation:org, membership:member,
    });
  }
}

export class Ledger extends DurableObject<Env> {
  private db;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => migrateStorage(ctx.storage));
    this.db = durableDatabase(ctx.storage);
  }
  async dispatch(request: Request, identity?: IdentityContext): Promise<Response> {
    // RPC arguments originate only in this Worker. Public HTTP headers cannot select a user or organisation.
    if (identity) {
      await this.db.transaction(async (db) => {
        await db.insert(users).values(identity.user).onConflictDoNothing();
        await db.insert(organisations).values(identity.organisation).onConflictDoNothing();
        await db.insert(organisationMemberships).values({id:identity.membership.id, userId:identity.user.id, organisationId:identity.organisation.id, role:identity.membership.role}).onConflictDoNothing();
      });
    } else if (!/^\/api\/public\/invoices\/[0-9a-f-]{36}_[0-9a-f-]{36}$/.test(new URL(request.url).pathname)) {
      return failure(401, 'UNAUTHORIZED', 'Unauthorized');
    }
    const sessionAuth = identity ? { api: {getSession: async () => ({user:identity.user})} } as unknown as Auth : undefined;
    const app = createApp({db:this.db, auth:sessionAuth, objectStore:durableObjectStore(this.ctx.storage), invoiceMailer:createUnavailableInvoiceMailer()});
    return app.fetch(request);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    const publicShare = path.match(/^\/api\/public\/invoices\/([0-9a-f-]{36})_[0-9a-f-]{36}$/);
    try {
      if (publicShare) return await env.LEDGERS.getByName(publicShare[1]).dispatch(request);
      if (path.startsWith('/api/')) return await env.IDENTITY.getByName('identity-v1').dispatch(request);
      return failure(404, 'NOT_FOUND', 'Not found');
    } catch (error) {
      console.error(JSON.stringify({msg:'request_failed', kind:error instanceof Error ? error.name : 'Error'}));
      return failure(503, 'SERVICE_UNAVAILABLE', 'Service temporarily unavailable. Please try again later.');
    }
  },
} satisfies ExportedHandler<Env>;
