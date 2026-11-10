import { describe, expect, it } from 'vitest';
import {
  assistantTurnRequestSchema,
  assistantTurnResponseSchema,
  previewAssistantProposalRequestSchema,
  previewAssistantProposalResponseSchema,
  saveAssistantDraftRequestSchema,
} from './assistant';

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

  it('accepts an issue date and a GST rate on the invoice or a line, and keeps them optional', () => {
    const edits = {
      issueDate: '2026-11-01',
      dueDate: '2026-11-20',
      taxRate: '15',
      lines: [
        { description: 'Plumbing', quantity: '1', rate: '100.00', taxRate: '15' },
        { description: 'Exempt supply', quantity: '1', rate: '40.00', taxRate: '0' },
      ],
    };
    expect(saveAssistantDraftRequestSchema.safeParse({
      conversationId: proposal.id,
      proposalId: proposal.customerId,
      edits,
    }).success).toBe(true);
    expect(saveAssistantDraftRequestSchema.safeParse({
      conversationId: proposal.id,
      proposalId: proposal.customerId,
      edits: { dueDate: '2026-11-13' },
    }).success).toBe(true);
    expect(previewAssistantProposalRequestSchema.safeParse({
      conversationId: proposal.id,
      edits,
    }).success).toBe(true);
  });

  it('rejects a GST rate outside 0 to 100 and a date that is not a real calendar day', () => {
    const base = { conversationId: proposal.id, proposalId: proposal.customerId };
    expect(saveAssistantDraftRequestSchema.safeParse({ ...base, edits: { taxRate: '100.01' } }).success).toBe(false);
    expect(saveAssistantDraftRequestSchema.safeParse({ ...base, edits: { taxRate: '-1' } }).success).toBe(false);
    expect(saveAssistantDraftRequestSchema.safeParse({
      ...base,
      edits: { lines: [{ description: 'Plumbing', quantity: '1', rate: '100.00', taxRate: '150' }] },
    }).success).toBe(false);
    expect(saveAssistantDraftRequestSchema.safeParse({ ...base, edits: { issueDate: '2026-02-31' } }).success).toBe(false);
    expect(saveAssistantDraftRequestSchema.safeParse({ ...base, edits: { issueDate: 'Friday' } }).success).toBe(false);
    expect(saveAssistantDraftRequestSchema.safeParse({
      ...base,
      edits: { issueDate: '2026-11-20', dueDate: '2026-11-13' },
    }).success).toBe(false);
    const preview = previewAssistantProposalRequestSchema.safeParse({
      conversationId: proposal.id,
      edits: { issueDate: '2026-02-31', taxRate: '150' },
    });
    expect(preview.success).toBe(false);
  });

  it('returns server totals and field errors, and does not accept a client total', () => {
    const parsed = previewAssistantProposalResponseSchema.parse({
      proposalId: proposal.id,
      date: '2026-11-01',
      dueDate: '2026-11-20',
      taxInclusive: false,
      taxRate: '15',
      lines: [
        { description: 'Plumbing', quantity: '1.00', rate: '100.00', taxRate: '15.00', tax: '15.00', total: '100.00' },
        { description: 'Exempt supply', quantity: '1.00', rate: '40.00', taxRate: '0', tax: '0.00', total: '40.00' },
      ],
      subtotal: '140.00',
      taxAmount: '15.00',
      total: '155.00',
      errors: [{ field: 'dueDate', message: "Due date can't be before the invoice date" }],
    });
    expect(parsed.total).toBe('155.00');
    expect(previewAssistantProposalResponseSchema.safeParse({ ...parsed, total: '1.00', clientTotal: '1.00' }).success).toBe(false);
    expect(previewAssistantProposalRequestSchema.safeParse({
      conversationId: proposal.id,
      edits: { lines: [{ description: 'Parts', quantity: '1', rate: '45.00' }] },
      total: '1.00',
    }).success).toBe(false);
  });

  it('rejects a proposal that tries to enable send', () => {
    expect(assistantTurnResponseSchema.safeParse({
      conversationId: '33333333-3333-4333-8333-333333333333',
      parts: [{ type: 'proposal', proposal: { ...proposal, actions: { saveDraft: true, send: true } } }],
    }).success).toBe(false);
  });
});
