import { and, eq, gte, lte } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { stripeConnectedAccounts, stripePaymentLinks, stripeVerificationState } from '../../db/schema/stripe';

export function accounts(db: Database) { return db.select().from(stripeConnectedAccounts).where(eq(stripeConnectedAccounts.status, 'active')); }
export async function claim(db: Database, organisationId: string, now: Date) {
  await db.insert(stripeVerificationState).values({ organisationId, nextVerificationAt: now }).onConflictDoNothing();
  const [row] = await db.update(stripeVerificationState).set({ nextVerificationAt: new Date(now.getTime() + 86_400_000), lastAttemptAt: now })
    .where(and(eq(stripeVerificationState.organisationId, organisationId), lte(stripeVerificationState.nextVerificationAt, now))).returning();
  return Boolean(row);
}
export async function finish(db: Database, organisationId: string, now: Date, failed: boolean) {
  await db.update(stripeVerificationState).set({ nextVerificationAt: new Date(now.getTime() + (failed ? 3_600_000 : 86_400_000)), ...(failed ? {} : { lastVerifiedAt: now }) }).where(eq(stripeVerificationState.organisationId, organisationId));
}
export async function states(db: Database) { return db.select().from(stripeVerificationState); }
export function recentLinks(db: Database, organisationId: string, since: Date) {
  return db.select().from(stripePaymentLinks).where(and(eq(stripePaymentLinks.organisationId, organisationId), eq(stripePaymentLinks.status, 'paid'), gte(stripePaymentLinks.updatedAt, since)));
}
