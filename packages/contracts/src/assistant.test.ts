import { describe, expect, it } from 'vitest';
import { assistantTurnRequestSchema, assistantTurnResponseSchema, saveAssistantDraftRequestSchema } from './assistant';

const proposal = {
  id: '11111111-1111-4111-8111-111111111111',
  kind: 'invoice' as const,
  status: 'ready' as const,
  customerId: '22222222-2222-4222-8222-222222222222',
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
  actions: { saveDraft: true as const, send: false as const },
};

describe('assistant contracts', () => {
  it('accepts a turn with text, quick picks, a link, and a proposal', () => {
    const parsed = assistantTurnResponseSchema.parse({
      conversationId: '33333333-3333-4333-8333-333333333333',
      parts: [
        { type: 'text', text: 'Some invoice details are still missing.' },
        { type: 'quick_picks', field: 'customerId', prompt: 'Which customer?', options: [{ id: proposal.customerId, label: 'Sarah Chen' }] },
        { type: 'link', href: '/invoices', label: 'Invoices' },
        { type: 'proposal', proposal },
      ],
    });
    expect(parsed.parts[3]).toMatchObject({ type: 'proposal', proposal: { actions: { send: false } } });
  });

  it('rejects client totals and a send flag on save', () => {
    expect(saveAssistantDraftRequestSchema.safeParse({
      conversationId: proposal.id,
      proposalId: proposal.customerId,
      edits: { lines: [{ description: 'Parts', quantity: '1', rate: '45.00' }] },
    }).success).toBe(true);
    expect(saveAssistantDraftRequestSchema.safeParse({
      conversationId: proposal.id,
      proposalId: proposal.customerId,
      total: '1.00',
    }).success).toBe(false);
    expect(assistantTurnRequestSchema.safeParse({ message: 'Invoice Sarah', organisationId: proposal.id }).success).toBe(false);
  });

  it('rejects a proposal that tries to enable send', () => {
    expect(assistantTurnResponseSchema.safeParse({
      conversationId: '33333333-3333-4333-8333-333333333333',
      parts: [{ type: 'proposal', proposal: { ...proposal, actions: { saveDraft: true, send: true } } }],
    }).success).toBe(false);
  });
});
