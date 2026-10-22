import { and, eq, isNull } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import { activeOrganisationSelections, organisationMemberships, organisations } from '../../db/schema/identity';

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

    const active = await tx.select({ membership: organisationMemberships, organisation: organisations })
      .from(organisationMemberships)
      .innerJoin(organisations, eq(organisations.id, organisationMemberships.organisationId))
      .where(and(
        eq(organisationMemberships.userId, userId),
        isNull(organisationMemberships.removedAt),
        isNull(organisations.archivedAt),
      ));
    const [selection] = await tx.select().from(activeOrganisationSelections).where(eq(activeOrganisationSelections.userId, userId));
    const membership = active.find((row) => row.membership.organisationId === selection?.organisationId)?.membership ?? active[0]?.membership;
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
