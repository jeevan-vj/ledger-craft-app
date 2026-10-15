import { eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import { organisationMemberships } from '../../db/schema/identity';

export type OrganisationContext = {
  userId: string;
  organisationId: string;
  role: string;
};

export async function withOrganisationTx<T>(
  db: Database,
  userId: string,
  run: (tx: Database, ctx: OrganisationContext) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {

    const memberships = await tx
      .select()
      .from(organisationMemberships)
      .where(eq(organisationMemberships.userId, userId));
    const membership = memberships[0];
    if (!membership) {
      throw new HTTPException(403, { message: 'No organisation membership' });
    }

    return run(tx as unknown as Database, {
      userId,
      organisationId: membership.organisationId,
      role: membership.role,
    });
  });
}
