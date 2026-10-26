import type { InvoiceImportDraftResponse } from '@ledgercraft/contracts';
import { commitDecision } from './reviewDecision';

function review(overrides: Partial<InvoiceImportDraftResponse> = {}): InvoiceImportDraftResponse {
  return {
    documentId: '11111111-1111-4111-8111-111111111111', status: 'needs_review', direction: null,
    thirdPartyIssued: false, contactId: null, provider: 'mock', mock: true,
    validationIssues: [], duplicateWarnings: [], contactSuggestions: [],
    draft: {
      issuerName: 'Cleancorp Ltd', issuerGstNumber: null, recipientName: 'Crystal Touch Cleaning', recipientGstNumber: null,
      documentNumber: 'BC-1001', issueDate: '2026-10-26', dueDate: '2026-11-09', currency: 'NZD',
      lineItems: [{ description: 'Cleaning services', quantity: '2', unitPrice: '100.00', amount: '200.00', gstRate: '15' }],
      net: '200.00', gst: '30.00', total: '230.00', suggestedDirection: 'SALES',
      suggestedDirectionReason: 'Recipient is the organisation', thirdPartyIssued: true, provider: 'mock', mock: true,
      confidence: {
        issuerName: { value: 0.99, label: 'High' }, issuerGstNumber: { value: 0, label: 'Missing' },
        recipientName: { value: 0.99, label: 'High' }, recipientGstNumber: { value: 0, label: 'Missing' },
        documentNumber: { value: 0.95, label: 'High' }, issueDate: { value: 0.9, label: 'High' }, dueDate: { value: 0.9, label: 'High' },
        currency: { value: 0.99, label: 'High' }, lineItems: [{ value: 0.92, label: 'High' }], net: { value: 0.98, label: 'High' },
        gst: { value: 0.98, label: 'High' }, total: { value: 0.99, label: 'High' }, suggestedDirection: { value: 0.9, label: 'High' },
        thirdPartyIssued: { value: 0.9, label: 'High' },
      },
    },
    ...overrides,
  };
}

describe('commitDecision', () => {
  it('requires an explicit Sales or Purchase decision even when AI suggests one', () => {
    expect(commitDecision(review(), false)).toEqual({ canCommit: false, reasons: ['Choose Sales income or Purchase / expense.', 'Choose a customer or vendor.'] });
  });

  it('requires a matching contact and duplicate acknowledgement', () => {
    const result = commitDecision(review({
      direction: 'SALES',
      duplicateWarnings: [{ kind: 'hash', recordType: 'import', recordId: '22222222-2222-4222-8222-222222222222', message: 'Same file' }],
    }), false);
    expect(result.canCommit).toBe(false);
    expect(result.reasons).toEqual(['Choose a customer or vendor.', 'Acknowledge the possible duplicate.']);
  });

  it('blocks on server totals mismatch and allows a complete review', () => {
    expect(commitDecision(review({
      direction: 'PURCHASE', contactId: '33333333-3333-4333-8333-333333333333',
      validationIssues: [{ code: 'totals_mismatch', path: 'total', message: 'Expected 230.00', blocking: true }],
    }), true).reasons).toEqual(['Correct the totals mismatch before creating the draft.']);

    expect(commitDecision(review({ direction: 'SALES', contactId: '33333333-3333-4333-8333-333333333333' }), false)).toEqual({ canCommit: true, reasons: [] });
  });
});
