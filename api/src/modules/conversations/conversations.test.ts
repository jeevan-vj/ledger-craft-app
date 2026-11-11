import { DatabaseSync } from 'node:sqlite';
import { conversationSchema, errorEnvelopeSchema } from '@ledgercraft/contracts';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { assistantProposals } from '../../db/schema/assistant-proposals';
import { getDatabaseUrl } from '../../env';
import { createAuth } from '../auth/auth';
import { assertLocalDatabaseReachable, withTestDb } from '../../test/harness';

function cookieHeader(response: Response): string {
  const cookies = response.headers.getSetCookie();
  return cookies.map((cookie) => cookie.split(';')[0]).join('; ');
}

const originHeaders = {
  Origin: 'http://localhost:8080',
  'Content-Type': 'application/json',
};

async function signUp(app: ReturnType<typeof createApp>, name: string, email = `${name.toLowerCase().replace(/\s+/g, '-')}-${crypto.randomUUID()}@example.com`) {
  const response = await app.request('/api/auth/sign-up/email', {
    method: 'POST',
    headers: originHeaders,
    body: JSON.stringify({ name, email, password: 'password123' }),
  });
  expect(response.status).toBeLessThan(400);
  return { cookie: cookieHeader(response) };
}

describe('conversation routes', () => {
  it('unauthenticated GET /api/conversations returns 401', async () => {
    const response = await createApp().request('/api/conversations');
    expect(response.status).toBe(401);
    expect(errorEnvelopeSchema.parse(await response.json()).error.code).toBe('UNAUTHORIZED');
  });

  it('creates a conversation, adds a message, and isolates organisations', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const auth = createAuth(db);
        const app = createApp({ auth, db, checkDatabase: async () => true });
        const ownerA = await signUp(app, 'Owner A');
        const ownerB = await signUp(app, 'Owner B');

        const ownership = await app.request('/api/conversations', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: ownerA.cookie },
          body: JSON.stringify({ title: 'GST help', organisationId: '11111111-1111-1111-1111-111111111111' }),
        });
        expect(ownership.status).toBe(400);

        const created = await app.request('/api/conversations', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: ownerA.cookie },
          body: JSON.stringify({ title: 'GST help' }),
        });
        expect(created.status).toBe(201);
        const conversation = conversationSchema.parse(await created.json());
        expect(conversation.title).toBe('GST help');
        expect(conversation.messages).toEqual([]);

        const messaged = await app.request(`/api/conversations/${conversation.id}/messages`, {
          method: 'POST',
          headers: { ...originHeaders, Cookie: ownerA.cookie },
          body: JSON.stringify({ role: 'user', content: 'What is my GST rate?' }),
        });
        expect(messaged.status).toBe(200);
        expect(conversationSchema.parse(await messaged.json()).messages).toHaveLength(1);

        const patched = await app.request(`/api/conversations/${conversation.id}`, {
          method: 'PATCH',
          headers: { ...originHeaders, Cookie: ownerA.cookie },
          body: JSON.stringify({ status: 'completed' }),
        });
        expect(patched.status).toBe(200);
        expect(conversationSchema.parse(await patched.json()).status).toBe('completed');

        const hidden = await app.request(`/api/conversations/${conversation.id}`, {
          headers: { Cookie: ownerB.cookie },
        });
        expect(hidden.status).toBe(404);
        expect(errorEnvelopeSchema.parse(await hidden.json()).error.code).toBe('NOT_FOUND');

        const deleted = await app.request(`/api/conversations/${conversation.id}`, {
          method: 'DELETE',
          headers: { Cookie: ownerA.cookie },
        });
        expect(deleted.status).toBe(204);
      } finally {
        await sql.end();
      }
    });
  });

  it('returns 404 for another member and leaves the owner proposal rows in place', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const auth = createAuth(db);
        const app = createApp({ auth, db, checkDatabase: async () => true });
        const owner = await signUp(app, 'Owner');
        const created = await app.request('/api/conversations', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: owner.cookie },
          body: JSON.stringify({ title: 'Invoice draft', context: { kind: 'assistant' } }),
        });
        expect(created.status).toBe(201);
        const conversation = conversationSchema.parse(await created.json());
        const me = await app.request('/api/me', { headers: { Cookie: owner.cookie } });
        expect(me.status).toBe(200);
        const organisationId = ((await me.json()) as { organisation: { id: string } }).organisation.id;
        const proposalId = crypto.randomUUID();
        await db.insert(assistantProposals).values({
          id: proposalId,
          organisationId,
          conversationId: conversation.id,
          payload: '{"kind":"invoice"}',
          signature: 'owner-proposal',
        });
        const before = await db.select().from(assistantProposals).where(eq(assistantProposals.id, proposalId));
        expect(before).toHaveLength(1);

        const memberEmail = `member-${crypto.randomUUID()}@example.com`;
        const invited = await app.request(`/api/organisations/${organisationId}/invitations`, {
          method: 'POST',
          headers: { ...originHeaders, Cookie: owner.cookie },
          body: JSON.stringify({ email: memberEmail, role: 'member' }),
        });
        expect(invited.status).toBe(201);
        const { acceptToken } = await invited.json() as { acceptToken: string };
        const member = await signUp(app, 'Teammate', memberEmail);
        const accepted = await app.request('/api/invitations/accept', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: member.cookie },
          body: JSON.stringify({ token: acceptToken }),
        });
        expect(accepted.status).toBe(200);

        const proposalDeletes: string[] = [];
        const prepare = DatabaseSync.prototype.prepare;
        DatabaseSync.prototype.prepare = function prepareAndWatch(sqlText: string) {
          if (/delete\s+from\s+"?assistant_proposals"?/i.test(sqlText)) proposalDeletes.push(sqlText);
          return prepare.call(this, sqlText);
        };
        let denied: Response;
        try {
          denied = await app.request(`/api/conversations/${conversation.id}`, {
            method: 'DELETE',
            headers: { Cookie: member.cookie },
          });
        } finally {
          DatabaseSync.prototype.prepare = prepare;
        }
        expect(denied.status).toBe(404);
        expect(errorEnvelopeSchema.parse(await denied.json()).error.code).toBe('NOT_FOUND');
        expect(proposalDeletes, 'proposal rows were deleted before the owner check').toEqual([]);
        expect(await db.select().from(assistantProposals).where(eq(assistantProposals.id, proposalId))).toEqual(before);

        const removed = await app.request(`/api/conversations/${conversation.id}`, {
          method: 'DELETE',
          headers: { Cookie: owner.cookie },
        });
        expect(removed.status).toBe(204);
        expect(await db.select().from(assistantProposals).where(eq(assistantProposals.id, proposalId))).toEqual([]);
      } finally {
        await sql.end();
      }
    });
  });
});
