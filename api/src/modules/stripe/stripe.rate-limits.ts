import { sql } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { stripeRateLimits } from '../../db/schema/stripe';
import { apiError } from '../../http-error';
import { hashIdempotencyPayload } from '../invoices/idempotency';

/** One SQLite upsert arbitrates concurrent requests. Only opaque SHA256 bucket
 * keys are persisted: no public payment token, IP or customer data. */
export async function consumeStripeRateLimit(db: Database, scope: string, identity: string, limit: number, windowMs: number, now = new Date()) {
  if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(windowMs) || windowMs < 1) throw new Error('Invalid Stripe limit configuration');
  const key = hashIdempotencyPayload([scope, identity]); const cutoff = now.getTime() - windowMs;
  const [row] = await db.insert(stripeRateLimits).values({ key, windowStartedAt: now, count: 1 }).onConflictDoUpdate({
    target: stripeRateLimits.key,
    set: {
      count: sql`CASE WHEN ${stripeRateLimits.windowStartedAt} <= ${cutoff} THEN 1 ELSE ${stripeRateLimits.count} + 1 END`,
      windowStartedAt: sql`CASE WHEN ${stripeRateLimits.windowStartedAt} <= ${cutoff} THEN ${now.getTime()} ELSE ${stripeRateLimits.windowStartedAt} END`,
    },
  }).returning();
  if (row.count > limit) throw apiError(429, 'STRIPE_RATE_LIMITED', 'Too many card-payment requests. Wait one minute and try again.');
}
