import type { AssistantProposal } from '@ledgercraft/contracts';
import { applyCustomerPick, buildSaveBody, draftFromProposal, draftHasEdits, draftReadyToSave } from './proposalDraft';

const proposalId = '22222222-2222-4222-8222-222222222222';
const customerId = '11111111-1111-4111-8111-111111111111';
const conversationId = '33333333-3333-4333-8333-333333333333';

function proposal(overrides: Partial<AssistantProposal> = {}): AssistantProposal {
  return {
    id: proposalId,
    kind: 'invoice',
    status: 'ready',
    customerId,
    customerName: 'Sarah Chen',
    date: '2026-11-09',
    dueDate: '2026-11-13',
    taxInclusive: true,
    taxRate: '15',
    currency: 'NZD',
    notes: null,
    lines: [{ description: 'Plumbing', quantity: '3', rate: '120.00', unit: 'h', itemId: null, missing: [] }],
    missing: [],
    totals: { subtotal: '313.04', taxAmount: '46.96', total: '360.00' },
    actions: { saveDraft: true, send: false },
    ...overrides,
  };
}

describe('proposal drafts', () => {
  it('keeps a typed rate and sends that rate on save', () => {
    const source = proposal();
    const draft = draftFromProposal(source);
    draft.lines[0] = { ...draft.lines[0], rate: '80.00' };
    expect(draft.lines[0]?.rate).toBe('80.00');
    expect(draftHasEdits(source, draft)).toBe(true);
    expect(buildSaveBody(conversationId, source, draft)).toEqual({
      conversationId,
      proposalId,
      edits: {
        lines: [{ description: 'Plumbing', quantity: '3', rate: '80.00', unit: 'h', itemId: null }],
      },
    });
  });

  it('omits edits when the card still matches the server proposal', () => {
    const source = proposal();
    const draft = draftFromProposal(source);
    expect(draftHasEdits(source, draft)).toBe(false);
    expect(buildSaveBody(conversationId, source, draft)).toEqual({ conversationId, proposalId });
  });

  it('stays incomplete until customer, due date, GST treatment, and rates are present', () => {
    const source = proposal({
      status: 'needs_input',
      customerId: null,
      customerName: null,
      dueDate: null,
      taxInclusive: null,
      totals: null,
      missing: ['customer', 'dueDate', 'taxInclusive', 'lines.0.rate'],
      lines: [{ description: 'Parts', quantity: '1', rate: null, unit: null, itemId: null, missing: ['rate'] }],
    });
    const draft = draftFromProposal(source);
    expect(draftReadyToSave(draft)).toBe(false);
    const picked = applyCustomerPick(draft, customerId, 'Sarah Chen');
    picked.dueDate = '2026-11-13';
    picked.taxInclusive = false;
    picked.lines[0] = { ...picked.lines[0], rate: '45.00' };
    expect(draftReadyToSave(picked)).toBe(true);
    expect(picked.customerName).toBe('Sarah Chen');
  });
});
