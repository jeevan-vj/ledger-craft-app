import { meResponseSchema, type MeResponse } from '@ledgercraft/contracts';
import { eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import { organisations } from '../../db/schema/identity';
import { withOrganisationTx } from './bind-organisation';

export async function getMe(
  db: Database,
  user: { id: string; email: string; name: string },
): Promise<MeResponse> {
  return withOrganisationTx(db, user.id, async (tx, ctx) => {
    const [organisation] = await tx
      .select()
      .from(organisations)
      .where(eq(organisations.id, ctx.organisationId));
    if (!organisation) {
      throw new HTTPException(403, { message: 'Organisation not found' });
    }

    return meResponseSchema.parse({
      user: { id: user.id, email: user.email, name: user.name },
      organisation: { id: organisation.id, name: organisation.name },
      membership: { role: ctx.role },
    });
  });
}
