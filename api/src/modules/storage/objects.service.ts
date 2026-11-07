import { createHash } from 'node:crypto';
import { objectSchema, type ObjectDto, type UploadObjectRequest } from '@ledgercraft/contracts';
import type { Database } from '../../db/client';
import { apiError } from '../../http-error';
import { withOrganisationTx } from '../auth/bind-organisation';
import {
  allowedContentTypes,
  assertKeyOwned,
  createObjectKey,
  decodeBase64Payload,
  maxBytesForKind,
  objectUrl,
} from './keys';
import type { ObjectStore, StoredObject } from './object-store';
import { receiptHasFinancialReference } from './receipt-references.repository';

export async function uploadObjectForUser(
  db: Database,
  userId: string,
  store: ObjectStore,
  input: UploadObjectRequest,
): Promise<ObjectDto> {
  return withOrganisationTx(db, userId, async (_tx, ctx) => {
    const allowed = allowedContentTypes(input.kind);
    if (!allowed.has(input.contentType)) {
      throw apiError(400, 'VALIDATION_ERROR', 'Unsupported content type');
    }
    const bytes = decodeBase64Payload(input.contentBase64);
    if (bytes.byteLength === 0) {
      throw apiError(400, 'VALIDATION_ERROR', 'Empty file');
    }
    if (bytes.byteLength > maxBytesForKind(input.kind)) {
      throw apiError(400, 'VALIDATION_ERROR', 'File is too large');
    }
    const key = createObjectKey(ctx.organisationId, input.kind, input.contentType, input.filename);
    await store.put({ key, contentType: input.contentType, bytes });
    return objectSchema.parse({
      key,
      url: objectUrl(key),
      contentType: input.contentType,
      size: bytes.byteLength,
      kind: input.kind,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  });
}

export async function getObjectForUser(
  db: Database,
  userId: string,
  store: ObjectStore,
  key: string,
): Promise<StoredObject> {
  return withOrganisationTx(db, userId, async (_tx, ctx) => {
    assertKeyOwned(key, ctx.organisationId);
    const object = await store.get(key);
    if (!object) throw apiError(404, 'NOT_FOUND', 'Object not found');
    return object;
  });
}

export async function deleteObjectForUser(
  db: Database,
  userId: string,
  store: ObjectStore,
  key: string,
  receiptOnly = false,
): Promise<void> {
  await withOrganisationTx(db, userId, async (tx, ctx) => {
    assertKeyOwned(key, ctx.organisationId);
    if (receiptOnly && !key.startsWith(`${ctx.organisationId}/receipts/`)) throw apiError(404, 'NOT_FOUND', 'Receipt not found');
    if (key.startsWith(`${ctx.organisationId}/receipts/`) && await receiptHasFinancialReference(tx, ctx.organisationId, key)) throw apiError(409, 'RECEIPT_IN_USE', 'This receipt is attached to a saved financial record. Remove or correct the record through its review workflow; the receipt has been retained.');
    await store.delete(key);
  });
}
