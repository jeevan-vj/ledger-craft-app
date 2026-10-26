import { describe, expect, it } from 'vitest';
import { createMockExtractionProvider } from './extraction';
import { recomputeAndValidateDraft } from './draft-validation';

describe('invoice import draft validation', () => {
  it('recomputes net, GST, and total in cents and accepts a one-cent tolerance', async () => {
    const draft = await createMockExtractionProvider().extractDocument({
      bytes: new Uint8Array(), mimeType: 'application/pdf', filename: 'sparkle-supplies-bill.pdf', sha256: 'f'.repeat(64),
    }, { organisationName: 'Crystal Touch Cleaning' });
    draft.total = '115.01';
    const result = recomputeAndValidateDraft(draft);
    expect(result.computed).toEqual({ net: '100.00', gst: '15.00', total: '115.00' });
    expect(result.issues).not.toContainEqual(expect.objectContaining({ code: 'totals_mismatch' }));
  });

  it('flags a provider total changed by document instructions and blocks commit', async () => {
    const draft = await createMockExtractionProvider().extractDocument({
      bytes: new Uint8Array(), mimeType: 'application/pdf', filename: 'prompt-injection-invoice.pdf', sha256: 'f'.repeat(64),
    }, { organisationName: 'Crystal Touch Cleaning' });
    const result = recomputeAndValidateDraft(draft);
    expect(result.computed).toEqual({ net: '100.00', gst: '15.00', total: '115.00' });
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'totals_mismatch', path: 'total', expected: '115.00', actual: '0.00', blocking: true,
    }));
  });

  it('uses half-up rounding without floating point arithmetic', () => {
    const result = recomputeAndValidateDraft({
      issuerName: 'Supplier', issuerGstNumber: null, recipientName: 'Business', recipientGstNumber: null,
      documentNumber: 'A-1', issueDate: '2026-10-26', dueDate: null, currency: 'NZD',
      lineItems: [{ description: 'Fractional service', quantity: '3', unitPrice: '0.335', amount: '1.01', gstRate: '15' }],
      net: '1.01', gst: '0.15', total: '1.16', suggestedDirection: 'PURCHASE', suggestedDirectionReason: 'supplier',
      thirdPartyIssued: false, provider: 'mock', mock: true,
      confidence: {
        issuerName: { value: 1, label: 'High' }, issuerGstNumber: { value: 0, label: 'Missing' },
        recipientName: { value: 1, label: 'High' }, recipientGstNumber: { value: 0, label: 'Missing' },
        documentNumber: { value: 1, label: 'High' }, issueDate: { value: 1, label: 'High' },
        dueDate: { value: 0, label: 'Missing' }, currency: { value: 1, label: 'High' },
        lineItems: [{ value: 1, label: 'High' }], net: { value: 1, label: 'High' }, gst: { value: 1, label: 'High' },
        total: { value: 1, label: 'High' }, suggestedDirection: { value: 1, label: 'High' }, thirdPartyIssued: { value: 1, label: 'High' },
      },
    });
    expect(result.computed).toEqual({ net: '1.01', gst: '0.15', total: '1.16' });
    expect(result.issues).toEqual([]);
  });
});
