import { Hono, type Context } from 'hono';
import { deleteAccountRequestSchema, deleteAccountResponseSchema } from '@ledgercraft/contracts';
import { isAPIError } from 'better-auth/api';
import type { AppEnv } from '../../types';
import { apiError } from '../../http-error';
import { AccountDeletionService } from './account-deletion.service';
import { purgeLocalOrganisationRows } from './local-organisation-purge';
import { getMe } from './get-me';
import { requireSession } from './require-session';

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
