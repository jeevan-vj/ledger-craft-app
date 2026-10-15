import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { idempotencyKeys } from '../../db/schema/idempotency';
import { apiError } from '../../http-error';

const KEY_PATTERN = /^[\w.-]{1,255}$/;

export type IdempotencyScope = {
  key: string;
  method: string;
  path: string;
  requestHash: string;
};

export function parseIdempotencyKey(header: string | undefined): string | undefined {
  if (header == null) return undefined;
  const key = header.trim();
  if (key.length === 0) return undefined;
  if (!KEY_PATTERN.test(key)) {
    throw apiError(400, 'VALIDATION_ERROR', 'Idempotency-Key must be 1-255 word characters');
  }
  return key;
}

export function hashIdempotencyPayload(body: unknown): string {
  return createHash('sha256').update(JSON.stringify(body)).digest('hex');
}

export async function getIdempotencyRecord(
  tx: Database,
  ctx: { organisationId: string; userId: string },
  scope: Omit<IdempotencyScope, 'requestHash'>,
) {
  const [row] = await tx
    .select()
    .from(idempotencyKeys)
    .where(
      and(
        eq(idempotencyKeys.organisationId, ctx.organisationId),
        eq(idempotencyKeys.userId, ctx.userId),
        eq(idempotencyKeys.method, scope.method),
        eq(idempotencyKeys.path, scope.path),
        eq(idempotencyKeys.key, scope.key),
      ),
    );
  return row;
}

export async function insertIdempotencyRecord(
  tx: Database,
  ctx: { organisationId: string; userId: string },
  scope: IdempotencyScope,
  response: { status: number; body: unknown },
): Promise<void> {
  await tx.insert(idempotencyKeys).values({
    organisationId: ctx.organisationId,
    userId: ctx.userId,
    key: scope.key,
    method: scope.method,
    path: scope.path,
    requestHash: scope.requestHash,
    responseStatus: response.status,
    responseBody: response.body,
  });
}

export function assertReplayMatches(storedHash: string, requestHash: string): void {
  if (storedHash !== requestHash) {
    throw apiError(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency-Key was reused with a different request');
  }
}
