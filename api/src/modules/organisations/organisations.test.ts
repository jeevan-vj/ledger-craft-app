import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { organisationInvitations, organisationMemberships } from '../../db/schema/identity';
import { getDatabaseUrl } from '../../env';
import { assertLocalDatabaseReachable, withTestDb } from '../../test/harness';
import { createAuth } from '../auth/auth';
import { eq } from 'drizzle-orm';

function cookies(response: Response): string {
  return response.headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; ');
}

async function signUp(app: ReturnType<typeof createApp>, email: string) {
  const response = await app.request('/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:8080' },
    body: JSON.stringify({ name: 'Company Owner', email, password: 'password123' }),
  });
  expect(response.status).toBeLessThan(400);
  return cookies(response);
}

describe('organisation collaboration', () => {
  it('creates and switches companies while keeping their ledgers isolated', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const app = createApp({ auth: createAuth(db), db });
        const cookie = await signUp(app, `owner-${crypto.randomUUID()}@example.com`);
        const headers = { Cookie: cookie, Origin: 'http://localhost:8080', 'Content-Type': 'application/json' };

        const firstCustomer = await app.request('/api/customers', {
          method: 'POST', headers,
          body: JSON.stringify({ name: 'North Customer', email: 'north@example.com', country: 'NZ' }),
        });
        expect(firstCustomer.status).toBe(201);

        const created = await app.request('/api/organisations', {
          method: 'POST', headers, body: JSON.stringify({ name: 'South Island Studio' }),
        });
        expect(created.status).toBe(201);
        const company = await created.json() as { organisation: { id: string } };

        const switched = await app.request(`/api/organisations/${company.organisation.id}/switch`, { method: 'POST', headers });
        expect(switched.status).toBe(200);
        const customers = await app.request('/api/customers', { headers });
        expect(customers.status).toBe(200);
        expect(await customers.json()).toEqual({ customers: [] });
      } finally {
        await sql.end();
      }
    });
  });

  it('rejects direct write access and privilege escalation for read-only members', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const auth = createAuth(db);
        const app = createApp({ auth, db });
        const cookie = await signUp(app, `viewer-${crypto.randomUUID()}@example.com`);
        const session = await auth.api.getSession({ headers: new Headers({ Cookie: cookie }) });
        expect(session).toBeTruthy();
        await db.update(organisationMemberships).set({ role: 'read_only' }).where(eq(organisationMemberships.userId, session!.user.id));
        const headers = { Cookie: cookie, Origin: 'http://localhost:8080', 'Content-Type': 'application/json' };

        const directWrite = await app.request('/api/customers', {
          method: 'POST', headers,
          body: JSON.stringify({ name: 'Forbidden', email: 'no@example.com', country: 'NZ' }),
        });
        expect(directWrite.status).toBe(403);

        const escalate = await app.request('/api/organisations/not-mine/members/not-me', {
          method: 'PATCH', headers, body: JSON.stringify({ role: 'admin' }),
        });
        expect(escalate.status).toBe(403);
      } finally {
        await sql.end();
      }
    });
  });

  it('binds invitations to a fresh email, rejects reuse, and removes ledger access with membership', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const app = createApp({ auth: createAuth(db), db });
        const ownerCookie = await signUp(app, `owner-${crypto.randomUUID()}@example.com`);
        const inviteeEmail = `accountant-${crypto.randomUUID()}@example.com`;
        const ownerHeaders = { Cookie: ownerCookie, Origin: 'http://localhost:8080', 'Content-Type': 'application/json' };
        const me = await app.request('/api/me', { headers: ownerHeaders });
        const organisationId = ((await me.json()) as { organisation: { id: string } }).organisation.id;
        const privateCustomer = await app.request('/api/customers', {
          method: 'POST', headers: ownerHeaders,
          body: JSON.stringify({ name: 'Owner-only customer', email: 'owner-only@example.com', country: 'NZ' }),
        });
        expect(privateCustomer.status).toBe(201);
        const invited = await app.request(`/api/organisations/${organisationId}/invitations`, {
          method: 'POST', headers: ownerHeaders,
          body: JSON.stringify({ email: inviteeEmail, role: 'accountant' }),
        });
        expect(invited.status).toBe(201);
        const invite = await invited.json() as { acceptToken: string; deliveryStatus: string };
        expect(invite.deliveryStatus).toBe('link_ready');

        const wrongCookie = await signUp(app, `wrong-${crypto.randomUUID()}@example.com`);
        const wrongEmail = await app.request('/api/invitations/accept', {
          method: 'POST', headers: { Cookie: wrongCookie, Origin: 'http://localhost:8080', 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: invite.acceptToken }),
        });
        expect(wrongEmail.status).toBe(403);

        const inviteeCookie = await signUp(app, inviteeEmail);
        const inviteeHeaders = { Cookie: inviteeCookie, Origin: 'http://localhost:8080', 'Content-Type': 'application/json' };
        const accepted = await app.request('/api/invitations/accept', {
          method: 'POST', headers: inviteeHeaders, body: JSON.stringify({ token: invite.acceptToken }),
        });
        expect(accepted.status).toBe(200);
        const reused = await app.request('/api/invitations/accept', {
          method: 'POST', headers: inviteeHeaders, body: JSON.stringify({ token: invite.acceptToken }),
        });
        expect(reused.status).toBe(409);

        const members = await app.request(`/api/organisations/${organisationId}/members`, { headers: ownerHeaders });
        const invitedMember = ((await members.json()) as { members: Array<{ id: string; email: string }> }).members.find((member) => member.email === inviteeEmail);
        expect(invitedMember).toBeTruthy();
        const removed = await app.request(`/api/organisations/${organisationId}/members/${invitedMember!.id}`, { method: 'DELETE', headers: ownerHeaders });
        expect(removed.status).toBe(204);
        const removedAccess = await app.request('/api/customers', { headers: inviteeHeaders });
        expect(removedAccess.status).toBe(200);
        expect(await removedAccess.json()).toEqual({ customers: [] });
        const removedAdministration = await app.request(`/api/organisations/${organisationId}/members`, { headers: inviteeHeaders });
        expect(removedAdministration.status).toBe(403);

        const expiredEmail = `expired-${crypto.randomUUID()}@example.com`;
        const expiring = await app.request(`/api/organisations/${organisationId}/invitations`, {
          method: 'POST', headers: ownerHeaders, body: JSON.stringify({ email: expiredEmail, role: 'member' }),
        });
        const expiredInvite = await expiring.json() as { id: string; acceptToken: string };
        await db.update(organisationInvitations).set({ expiresAt: new Date(0) }).where(eq(organisationInvitations.id, expiredInvite.id));
        const expiredCookie = await signUp(app, expiredEmail);
        const expiredAccept = await app.request('/api/invitations/accept', {
          method: 'POST', headers: { Cookie: expiredCookie, Origin: 'http://localhost:8080', 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: expiredInvite.acceptToken }),
        });
        expect(expiredAccept.status).toBe(410);
      } finally {
        await sql.end();
      }
    });
  });
});
