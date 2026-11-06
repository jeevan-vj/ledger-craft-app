import { Hono, type Context } from 'hono';
import { accountSessionListSchema, deleteAccountRequestSchema, deleteAccountResponseSchema } from '@ledgercraft/contracts';
import { isAPIError } from 'better-auth/api';
import type { AppEnv } from '../../types';
import { apiError } from '../../http-error';
import { AccountDeletionService } from './account-deletion.service';
import { purgeLocalOrganisationRows } from './local-organisation-purge';
import { getMe } from './get-me';
import { requireSession } from './require-session';
import { z } from 'zod';

const revokeSessionSchema = z.object({ token: z.string().min(1) }).strict();

async function handleMe(c: Context<AppEnv>) {
  const { db, user } = await requireSession(c);
  return c.json(await getMe(db, user));
}

async function parseDeleteAccountRequest(c: Context<AppEnv>) {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw apiError(400, 'VALIDATION_ERROR', 'Request body must be valid JSON.');
  }
  return deleteAccountRequestSchema.parse(body);
}

export function sessionRoutes() {
  const routes = new Hono<AppEnv>();
  routes.get('/me', handleMe);
  routes.get('/api/me', handleMe);
  routes.get('/api/me/sessions', async (c) => {
    await requireSession(c);
    const auth = c.get('auth')!;
    const [current, sessions] = await Promise.all([
      auth.api.getSession({ headers: c.req.raw.headers }),
      auth.api.listSessions({ headers: c.req.raw.headers }),
    ]);
    return c.json(accountSessionListSchema.parse(sessions.map((session) => ({
      ...session,
      current: session.token === current?.session.token,
    }))));
  });
  routes.post('/api/me/sessions/revoke', async (c) => {
    await requireSession(c);
    const auth = c.get('auth')!;
    const input = revokeSessionSchema.parse(await c.req.json());
    const current = await auth.api.getSession({ headers: c.req.raw.headers });
    if (input.token === current?.session.token) {
      throw apiError(400, 'CURRENT_SESSION', 'Use Sign out to end this device session.');
    }
    await auth.api.revokeSession({ headers: c.req.raw.headers, body: input });
    return c.json({ status: true as const });
  });
  routes.post('/api/me/sessions/revoke-others', async (c) => {
    await requireSession(c);
    await c.get('auth')!.api.revokeOtherSessions({ headers: c.req.raw.headers });
    return c.json({ status: true as const });
  });
  routes.post('/api/me/sessions/revoke-all', async (c) => {
    await requireSession(c);
    await c.get('auth')!.api.revokeSessions({ headers: c.req.raw.headers });
    return c.json({ status: true as const });
  });
  routes.delete('/api/me', async (c) => {
    const auth = c.get('auth');
    const { db, user } = await requireSession(c);
    const input = await parseDeleteAccountRequest(c);
    try {
      await auth!.api.verifyPassword({ headers: c.req.raw.headers, body: { password: input.password } });
    } catch (error) {
      if (!isAPIError(error) || error.body?.code !== 'INVALID_PASSWORD') {
        throw error;
      }
      throw apiError(401, 'INVALID_CREDENTIALS', 'Your current password is incorrect.');
    }
    const service = new AccountDeletionService({
      hooks: c.get('accountPreDeleteHooks'),
      purgeOrganisation: c.get('purgeOrganisation') ?? ((organisationId) => purgeLocalOrganisationRows(db, organisationId)),
      removeOrganisationMembership: c.get('removeOrganisationMembership'),
    });
    return c.json(deleteAccountResponseSchema.parse(await service.delete(db, user)));
  });
  return routes;
}
