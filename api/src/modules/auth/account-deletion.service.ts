import { and, eq, isNull } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import { runSequentially } from '../../lib/run-sequentially';
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
type ActiveMembership = typeof organisationMemberships.$inferSelect;
type DeletionPlan = { organisationsToPurge: string[]; organisationsToLeave: string[] };

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function createDeletionPlan(
  db: Database,
  userId: string,
  memberships: ActiveMembership[],
): Promise<DeletionPlan> {
  const plan: DeletionPlan = { organisationsToPurge: [], organisationsToLeave: [] };
  await runSequentially(memberships, async (membership) => {
    if (membership.role !== 'owner') {
      plan.organisationsToLeave.push(membership.organisationId);
      return;
    }
    const activeMembers = await db.select().from(organisationMemberships).where(and(
      eq(organisationMemberships.organisationId, membership.organisationId),
      isNull(organisationMemberships.removedAt),
    ));
    const otherOwners = activeMembers.filter((candidate) => candidate.userId !== userId && candidate.role === 'owner');
    if (otherOwners.length === 0 && activeMembers.some((candidate) => candidate.userId !== userId)) {
      throw new HTTPException(409, { message: 'Transfer ownership or remove the other members before deleting your account.' });
    }
    const destination = otherOwners.length === 0 ? plan.organisationsToPurge : plan.organisationsToLeave;
    destination.push(membership.organisationId);
  });
  return plan;
}

async function runPreDeleteHooks(
  hooks: readonly AccountPreDeleteHook[],
  context: AccountDeletionContext,
): Promise<void> {
  await runSequentially(hooks, async (hook) => {
    try {
      await hook.onBeforeAccountDelete(context);
    } catch {
      if (hook.required) {
        throw new HTTPException(503, { message: `Account deletion stopped because ${hook.name} access could not be revoked. Try again.` });
      }
    }
  });
}

async function applyOrganisationPlan(
  options: AccountDeletionServiceOptions,
  plan: DeletionPlan,
  userId: string,
): Promise<void> {
  await runSequentially(plan.organisationsToPurge, options.purgeOrganisation);
  await runSequentially(plan.organisationsToLeave, async (organisationId) => {
    await options.removeOrganisationMembership?.(organisationId, userId);
  });
}

async function deleteIdentityData(
  db: Database,
  user: DeletingUser,
  plan: DeletionPlan,
  deletionKey: string,
  deletedAt: Date,
): Promise<void> {
  await db.transaction(async (tx) => {
    await runSequentially(plan.organisationsToPurge, async (organisationId) => {
      await tx.delete(organisations).where(eq(organisations.id, organisationId));
    });
    await tx.delete(organisationMemberships).where(eq(organisationMemberships.userId, user.id));
    await tx.delete(organisationInvitations).where(eq(organisationInvitations.email, user.email));
    await tx.delete(activeOrganisationSelections).where(eq(activeOrganisationSelections.userId, user.id));
    await tx.delete(sessions).where(eq(sessions.userId, user.id));
    await tx.delete(authAccounts).where(eq(authAccounts.userId, user.id));
    await tx.delete(verifications).where(eq(verifications.identifier, user.email));
    await tx.insert(accountDeletionTombstones).values({ userIdHash: deletionKey, deletedAt }).onConflictDoNothing();
    await tx.delete(users).where(eq(users.id, user.id));
  });
}

export class AccountDeletionService {
  constructor(private readonly options: AccountDeletionServiceOptions) {}

  async delete(db: Database, user: DeletingUser): Promise<{ deleted: true; deletedAt: string }> {
    const deletionKey = await sha256(user.id);
    const memberships = await db.select().from(organisationMemberships).where(and(
      eq(organisationMemberships.userId, user.id),
      isNull(organisationMemberships.removedAt),
    ));
    const plan = await createDeletionPlan(db, user.id, memberships);
    await runPreDeleteHooks(this.options.hooks ?? [], { userId: user.id, deletionKey });
    await applyOrganisationPlan(this.options, plan, user.id);
    const deletedAt = this.options.now?.() ?? new Date();
    await deleteIdentityData(db, user, plan, deletionKey, deletedAt);
    return { deleted: true, deletedAt: deletedAt.toISOString() };
  }
}
