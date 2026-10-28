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

const PDF_WHITESPACE = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);

function isPdfWhitespace(byte: number | undefined): boolean {
  return byte !== undefined && PDF_WHITESPACE.has(byte);
}

function keywordAt(bytes: Uint8Array, index: number, word: string): boolean {
  if (index < 0 || index + word.length > bytes.length) return false;
  for (let offset = 0; offset < word.length; offset += 1) {
    if (bytes[index + offset] !== word.charCodeAt(offset)) return false;
  }
  const previous = index === 0 ? undefined : bytes[index - 1];
  if (previous === 0x2f) return false;
  return previous === undefined || isPdfWhitespace(previous) || previous === 0x3e || previous === 0x5d;
}

function skipPdfStream(bytes: Uint8Array, index: number): number {
  let cursor = index;
  while (cursor < bytes.length && !keywordAt(bytes, cursor, 'endstream')) cursor += 1;
  return cursor < bytes.length ? cursor + 'endstream'.length : bytes.length;
}

function startsWithAscii(bytes: Uint8Array, index: number, word: string): boolean {
  if (index < 0 || index + word.length > bytes.length) return false;
  for (let offset = 0; offset < word.length; offset += 1) {
    if (bytes[index + offset] !== word.charCodeAt(offset)) return false;
  }
  return true;
}

function isNameContinuation(byte: number | undefined): boolean {
  if (byte === undefined) return false;
  return (byte >= 0x30 && byte <= 0x39) || (byte >= 0x41 && byte <= 0x5a) || (byte >= 0x61 && byte <= 0x7a);
}

function isPageName(bytes: Uint8Array, index: number): boolean {
  const page = '/Page';
  if (!startsWithAscii(bytes, index, page)) return false;
  return !isNameContinuation(bytes[index + page.length]);
}

function matchStructuralPage(bytes: Uint8Array, index: number): boolean {
  if (!startsWithAscii(bytes, index, '/Type')) return false;
  let cursor = index + '/Type'.length;
  while (isPdfWhitespace(bytes[cursor])) cursor += 1;
  return isPageName(bytes, cursor);
}

export function countPdfPages(bytes: Uint8Array): number | null {
  let count = 0;
  let stringDepth = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index]!;
    if (stringDepth > 0) {
      if (byte === 0x5c) {
        index += 1;
        continue;
      }
      if (byte === 0x28) stringDepth += 1;
      else if (byte === 0x29) stringDepth -= 1;
      continue;
    }
    if (byte === 0x28) {
      stringDepth = 1;
      continue;
    }
    if (byte === 0x25) {
      while (index + 1 < bytes.length && bytes[index + 1] !== 0x0a && bytes[index + 1] !== 0x0d) index += 1;
      continue;
    }
    if (keywordAt(bytes, index, 'stream')) {
      const after = index + 'stream'.length;
      if (bytes[after] === 0x0d || bytes[after] === 0x0a) {
        let body = after + 1;
        if (bytes[after] === 0x0d && bytes[body] === 0x0a) body += 1;
        index = skipPdfStream(bytes, body) - 1;
        continue;
      }
    }
    if (matchStructuralPage(bytes, index)) count += 1;
  }
  return count > 0 ? count : null;
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

export function assertPdfWithinPageCap(bytes: Uint8Array, maxPages = invoiceImportMaxPages()): number | null {
  const pageCount = countPdfPages(bytes);
  if (pageCount !== null && pageCount > maxPages) {
    throw apiError(400, 'TOO_MANY_PAGES', `PDF has too many pages (maximum ${maxPages})`);
  }
  return pageCount;
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
  const maxPages = input.maxPages ?? invoiceImportMaxPages();
  const pageCount = mimeType === 'application/pdf' ? assertPdfWithinPageCap(input.bytes, maxPages) : 1;
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
