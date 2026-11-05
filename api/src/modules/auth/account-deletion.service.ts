import { and, eq, isNull } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import {
  accountDeletionTombstones,
  activeOrganisationSelections,
  authAccounts,
  organisationInvitations,
  organisationMemberships,
  organisations,
  sessions,
  users,
  verifications,
} from '../../db/schema/identity';

export type AccountDeletionContext = {
  userId: string;
  /** Stable, non-PII key for idempotent provider revocation. */
  deletionKey: string;
};

export interface AccountPreDeleteHook {
  readonly name: string;
  readonly required: boolean;
  onBeforeAccountDelete(context: AccountDeletionContext): Promise<void>;
}

export type AccountDeletionServiceOptions = {
  hooks?: readonly AccountPreDeleteHook[];
  purgeOrganisation: (organisationId: string) => Promise<void>;
  removeOrganisationMembership?: (organisationId: string, userId: string) => Promise<void>;
  now?: () => Date;
};

type DeletingUser = { id: string; email: string; name: string };

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export class AccountDeletionService {
  constructor(private readonly options: AccountDeletionServiceOptions) {}

  async delete(db: Database, user: DeletingUser): Promise<{ deleted: true; deletedAt: string }> {
    const deletionKey = await sha256(user.id);
    const memberships = await db.select().from(organisationMemberships).where(and(
      eq(organisationMemberships.userId, user.id),
      isNull(organisationMemberships.removedAt),
    ));

    const organisationsToPurge: string[] = [];
    const organisationsToLeave: string[] = [];
    for (const membership of memberships) {
      if (membership.role !== 'owner') {
        organisationsToLeave.push(membership.organisationId);
        continue;
      }
      const activeMembers = await db.select().from(organisationMemberships).where(and(
        eq(organisationMemberships.organisationId, membership.organisationId),
        isNull(organisationMemberships.removedAt),
      ));
      const otherOwners = activeMembers.filter((candidate) => candidate.userId !== user.id && candidate.role === 'owner');
      if (otherOwners.length === 0 && activeMembers.some((candidate) => candidate.userId !== user.id)) {
        throw new HTTPException(409, { message: 'Transfer ownership or remove the other members before deleting your account.' });
      }
      if (otherOwners.length === 0) organisationsToPurge.push(membership.organisationId);
      else organisationsToLeave.push(membership.organisationId);
    }

    for (const hook of this.options.hooks ?? []) {
      try {
        await hook.onBeforeAccountDelete({ userId: user.id, deletionKey });
      } catch (error) {
        if (hook.required) {
          throw new HTTPException(503, { message: `Account deletion stopped because ${hook.name} access could not be revoked. Try again.` });
        }
      }
    }

    for (const organisationId of organisationsToPurge) {
      await this.options.purgeOrganisation(organisationId);
    }
    for (const organisationId of organisationsToLeave) {
      await this.options.removeOrganisationMembership?.(organisationId, user.id);
    }

    const deletedAt = this.options.now?.() ?? new Date();
    await db.transaction(async (tx) => {
      for (const organisationId of organisationsToPurge) {
        await tx.delete(organisations).where(eq(organisations.id, organisationId));
      }
      await tx.delete(organisationMemberships).where(eq(organisationMemberships.userId, user.id));
      await tx.delete(organisationInvitations).where(eq(organisationInvitations.email, user.email));
      await tx.delete(activeOrganisationSelections).where(eq(activeOrganisationSelections.userId, user.id));
      await tx.delete(sessions).where(eq(sessions.userId, user.id));
      await tx.delete(authAccounts).where(eq(authAccounts.userId, user.id));
      await tx.delete(verifications).where(eq(verifications.identifier, user.email));
      await tx.insert(accountDeletionTombstones).values({ userIdHash: deletionKey, deletedAt }).onConflictDoNothing();
      await tx.delete(users).where(eq(users.id, user.id));
    });
    return { deleted: true, deletedAt: deletedAt.toISOString() };
  }
}
