import { describe, expect, it } from 'vitest';
import {
  countPdfPages,
  sanitizeImportFilename,
  sniffInvoiceImportMimeType,
  validateInvoiceImportFile,
} from './invoice-import-validation';

const encoder = new TextEncoder();

describe('invoice import file validation', () => {
  it.each([
    [encoder.encode('%PDF-1.7\n1 0 obj << /Type /Page >>'), 'application/pdf'],
    [new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg'],
    [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'image/png'],
    [encoder.encode('RIFF\0\0\0\0WEBP'), 'image/webp'],
    [encoder.encode('\0\0\0\u0018ftypheic'), 'image/heic'],
    [encoder.encode('\0\0\0\u0018ftypheix'), 'image/heic'],
    [encoder.encode('\0\0\0\u0018ftypmif1'), 'image/heic'],
  ])('sniffs supported file bytes as %s', (bytes, mimeType) => {
    expect(sniffInvoiceImportMimeType(bytes)).toBe(mimeType);
  });

  it('rejects unsupported bytes and a declared MIME mismatch', () => {
    expect(() => validateInvoiceImportFile({
      bytes: encoder.encode('not an invoice'),
      declaredContentType: 'application/pdf',
    })).toThrowError(/supported PDF or image/i);

    expect(() => validateInvoiceImportFile({
      bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
      declaredContentType: 'application/pdf',
    })).toThrowError(/does not match/i);
  });

  it('enforces the configured byte and PDF page caps', () => {
    expect(() => validateInvoiceImportFile({
      bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]),
      declaredContentType: 'image/jpeg',
      maxBytes: 4,
    })).toThrowError(/too large/i);

    const pdf = encoder.encode('%PDF-1.7\n/Type /Pages /Count 2\n/Type /Page\n/Type /Page');
    expect(countPdfPages(pdf)).toBe(2);
    expect(() => validateInvoiceImportFile({
      bytes: pdf,
      declaredContentType: 'application/pdf',
      maxPages: 1,
    })).toThrowError(/too many pages/i);

    const objectStream = encoder.encode([
      '%PDF-1.7',
      '1 0 obj',
      '<< /Type /ObjStm /N 1 /Filter /FlateDecode /Length 24 >>',
      'stream',
      '/Type /Page /Type /Page',
      'endstream',
      'endobj',
      '%%EOF',
    ].join('\n'));
    expect(countPdfPages(objectStream)).toBeNull();
    expect(validateInvoiceImportFile({
      bytes: objectStream,
      declaredContentType: 'application/pdf',
    })).toEqual({ mimeType: 'application/pdf', pageCount: null });

    const planted = encoder.encode([
      '%PDF-1.4',
      '1 0 obj',
      '<< /Length 22 >>',
      'stream',
      '/Type /Page planted',
      'endstream',
      'endobj',
      '2 0 obj',
      '<< /Type /Page /Note (see /Type /Page inside) >>',
      'endobj',
      '%%EOF',
    ].join('\n'));
    expect(countPdfPages(planted)).toBe(1);
    expect(validateInvoiceImportFile({
      bytes: planted,
      declaredContentType: 'application/pdf',
      maxPages: 1,
    })).toEqual({ mimeType: 'application/pdf', pageCount: 1 });

    const uncountable = encoder.encode('%PDF-1.7\n1 0 obj << /Filter /FlateDecode >>\n%%EOF');
    expect(countPdfPages(uncountable)).toBeNull();
    expect(validateInvoiceImportFile({
      bytes: uncountable,
      declaredContentType: 'application/pdf',
      maxBytes: uncountable.byteLength,
    })).toEqual({ mimeType: 'application/pdf', pageCount: null });
    expect(() => validateInvoiceImportFile({
      bytes: uncountable,
      declaredContentType: 'application/pdf',
      maxBytes: uncountable.byteLength - 1,
    })).toThrowError(/too large/i);
  });

  it('returns sniffed metadata and counts one-page PDFs without counting /Pages', () => {
    const bytes = encoder.encode('%PDF-1.4\n1 0 obj << /Type /Pages /Count 1 >>\n2 0 obj << /Type /Page >>');
    expect(validateInvoiceImportFile({ bytes, declaredContentType: 'application/pdf' })).toEqual({
      mimeType: 'application/pdf',
      pageCount: 1,
    });
  });
});

describe('sanitizeImportFilename', () => {
  it('strips paths and controls while keeping a safe extension', () => {
    expect(sanitizeImportFilename('../private/..\\Cleancorp\u0000 invoice.PDF')).toBe('Cleancorp invoice.PDF');
    expect(sanitizeImportFilename('/')).toBe('invoice');
  });

  it('limits names without dropping the extension', () => {
    const result = sanitizeImportFilename(`${'a'.repeat(300)}.jpeg`, 80);
    expect(result).toHaveLength(80);
    expect(result.endsWith('.jpeg')).toBe(true);
  });
});
