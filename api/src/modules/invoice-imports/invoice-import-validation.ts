import { apiError } from '../../http-error';

export const DEFAULT_INVOICE_IMPORT_MAX_BYTES = 1024 * 1024;
export const DEFAULT_INVOICE_IMPORT_MAX_PAGES = 20;

export type InvoiceImportMimeType =
  | 'application/pdf'
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/heic';

const MIME_ALIASES: Record<string, InvoiceImportMimeType | undefined> = {
  'application/pdf': 'application/pdf',
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
  'image/heic': 'image/heic',
  'image/heif': 'image/heic',
};

function startsWith(bytes: Uint8Array, expected: readonly number[]): boolean {
  return expected.every((value, index) => bytes[index] === value);
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

export function sniffInvoiceImportMimeType(bytes: Uint8Array): InvoiceImportMimeType | undefined {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'image/webp';
  if (ascii(bytes, 4, 4) === 'ftyp' && ['heic', 'heix', 'mif1'].includes(ascii(bytes, 8, 4))) {
    return 'image/heic';
  }
  return undefined;
}

export function countPdfPages(bytes: Uint8Array): number | null {
  const text = new TextDecoder('latin1').decode(bytes);
  const matches = text.match(/\/Type\s*\/Page(?!s)\b/g);
  return matches?.length ? matches.length : null;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function invoiceImportMaxBytes(storageDefault = DEFAULT_INVOICE_IMPORT_MAX_BYTES): number {
  return positiveInteger(process.env.INVOICE_IMPORT_MAX_BYTES, storageDefault);
}

export function invoiceImportMaxPages(): number {
  return positiveInteger(process.env.INVOICE_IMPORT_MAX_PAGES, DEFAULT_INVOICE_IMPORT_MAX_PAGES);
}

export function validateInvoiceImportFile(input: {
  bytes: Uint8Array;
  declaredContentType: string;
  maxBytes?: number;
  maxPages?: number;
}): { mimeType: InvoiceImportMimeType; pageCount: number | null } {
  const maxBytes = input.maxBytes ?? invoiceImportMaxBytes();
  if (input.bytes.byteLength === 0) throw apiError(400, 'EMPTY_FILE', 'Uploaded file is empty');
  if (input.bytes.byteLength > maxBytes) {
    throw apiError(413, 'FILE_TOO_LARGE', `Uploaded file is too large (maximum ${maxBytes} bytes)`);
  }
  const mimeType = sniffInvoiceImportMimeType(input.bytes);
  if (!mimeType) throw apiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Upload must be a supported PDF or image');
  const declared = MIME_ALIASES[input.declaredContentType.toLowerCase().split(';', 1)[0]!.trim()];
  if (declared !== mimeType) {
    throw apiError(415, 'MIME_TYPE_MISMATCH', 'Declared content type does not match the uploaded file');
  }
  const pageCount = mimeType === 'application/pdf' ? countPdfPages(input.bytes) : 1;
  const maxPages = input.maxPages ?? invoiceImportMaxPages();
  if (pageCount !== null && pageCount > maxPages) {
    throw apiError(400, 'TOO_MANY_PAGES', `PDF has too many pages (maximum ${maxPages})`);
  }
  return { mimeType, pageCount };
}

export function sanitizeImportFilename(filename: string, maxLength = 180): string {
  // eslint-disable-next-line no-control-regex -- intentionally strips control characters from filenames
  const withoutControls = filename.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  const base = withoutControls.split(/[\\/]/).filter(Boolean).at(-1)?.trim() || 'invoice';
  const safe = base.replace(/[<>:"|?*]/g, '_').replace(/^\.+/, '').trim() || 'invoice';
  if (safe.length <= maxLength) return safe;
  const dot = safe.lastIndexOf('.');
  const extension = dot > 0 && safe.length - dot <= 12 ? safe.slice(dot) : '';
  const stemLength = Math.max(1, maxLength - extension.length);
  return `${safe.slice(0, stemLength)}${extension}`;
}

export function decodeInvoiceImportBase64(value: string, maxBytes = invoiceImportMaxBytes()): Uint8Array {
  const comma = value.indexOf(',');
  const raw = value.startsWith('data:') && comma >= 0 ? value.slice(comma + 1) : value;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(raw) || raw.length % 4 === 1) {
    throw apiError(400, 'VALIDATION_ERROR', 'File content must be valid base64');
  }
  if (raw.length > Math.ceil(maxBytes / 3) * 4 + 4) {
    throw apiError(413, 'FILE_TOO_LARGE', `Uploaded file is too large (maximum ${maxBytes} bytes)`);
  }
  const bytes = new Uint8Array(Buffer.from(raw, 'base64'));
  if (bytes.byteLength > maxBytes) {
    throw apiError(413, 'FILE_TOO_LARGE', `Uploaded file is too large (maximum ${maxBytes} bytes)`);
  }
  return bytes;
}
