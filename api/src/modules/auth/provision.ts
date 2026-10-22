import type { Database } from '../../db/client';
import { activeOrganisationSelections, organisationMemberships, organisations } from '../../db/schema/identity';

export async function provisionOrganisationForUser(
  db: Database,
  user: { id: string; name: string },
): Promise<{ organisationId: string }> {
  const organisationId = crypto.randomUUID();
  const name = user.name.trim().length > 0 ? `${user.name.trim()}'s organisation` : 'Organisation';

  await db.transaction(async (tx) => {
    await tx.insert(organisations).values({ id: organisationId, name });
    await tx.insert(organisationMemberships).values({
      organisationId,
      userId: user.id,
      role: 'owner',
    });
    await tx.insert(activeOrganisationSelections).values({ userId: user.id, organisationId });
  });

  return { organisationId };
}
