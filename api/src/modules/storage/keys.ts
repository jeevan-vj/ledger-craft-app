import { randomUUID } from 'node:crypto';
import type { ObjectKind } from '@ledgercraft/contracts';
import { apiError } from '../../http-error';

const RECEIPT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const LOGO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const RECEIPT_MAX_BYTES = 1024 * 1024;
const LOGO_MAX_BYTES = 1024 * 1024;

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

export function kindFolder(kind: ObjectKind): 'receipts' | 'logos' | 'bank-attachments' {
  if (kind === 'receipt') return 'receipts';
  if (kind === 'bank_attachment') return 'bank-attachments';
  return 'logos';
}

export function allowedContentTypes(kind: ObjectKind): Set<string> {
  return kind === 'receipt' || kind === 'bank_attachment' ? RECEIPT_TYPES : LOGO_TYPES;
}

export function maxBytesForKind(kind: ObjectKind): number {
  return kind === 'receipt' || kind === 'bank_attachment' ? RECEIPT_MAX_BYTES : LOGO_MAX_BYTES;
}

export function extensionForContentType(contentType: string, filename: string): string {
  const fromType = EXT_BY_TYPE[contentType];
  if (fromType) return fromType;
  const fromName = filename.split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,8}$/.test(fromName)) return fromName;
  return 'bin';
}

export function createObjectKey(organisationId: string, kind: ObjectKind, contentType: string, filename: string): string {
  const ext = extensionForContentType(contentType, filename);
  return `${organisationId}/${kindFolder(kind)}/${randomUUID()}.${ext}`;
}

export function assertKeyOwned(key: string, organisationId: string): void {
  if (key.includes('..') || key.startsWith('/') || !key.startsWith(`${organisationId}/`)) {
    throw apiError(404, 'NOT_FOUND', 'Object not found');
  }
}

export function decodeBase64Payload(contentBase64: string): Uint8Array {
  const comma = contentBase64.indexOf(',');
  const raw = contentBase64.startsWith('data:') && comma >= 0 ? contentBase64.slice(comma + 1) : contentBase64;
  if (raw.length > Math.ceil(RECEIPT_MAX_BYTES / 3) * 4) {
    throw apiError(413, 'FILE_TOO_LARGE', 'Files must be 1 MB or smaller');
  }
  try {
    return new Uint8Array(Buffer.from(raw, 'base64'));
  } catch {
    throw apiError(400, 'VALIDATION_ERROR', 'Invalid base64 content');
  }
}

export function objectUrl(key: string): string {
  return `/api/objects?key=${encodeURIComponent(key)}`;
}
