import { apiRequest } from '@/features/auth/api/http';
import { askAssistant, previewAssistantProposal, saveAssistantDraft } from './assistantApi';


jest.mock('@/features/auth/api/http', () => ({
  apiRequest: jest.fn(),
}));

const conversationId = '33333333-3333-4333-8333-333333333333';
const proposalId = '22222222-2222-4222-8222-222222222222';

describe('assistant API', () => {
  beforeEach(() => {
    jest.mocked(apiRequest).mockReset();
  });

  it('posts a turn and parses the structured reply', async () => {
    jest.mocked(apiRequest).mockResolvedValue({
      conversationId,
      parts: [{ type: 'text', text: 'No outstanding invoices.' }],
    });
    const signal = new AbortController().signal;
    await expect(askAssistant({ message: 'Who owes me money?' }, signal)).resolves.toEqual({
      conversationId,
      parts: [{ type: 'text', text: 'No outstanding invoices.' }],
    });
    expect(apiRequest).toHaveBeenCalledWith('/api/ai/assistant', {
      method: 'POST',
      body: JSON.stringify({ message: 'Who owes me money?' }),
      signal,
    });
  });

  it('saves a draft with one idempotency key and returns the invoice id', async () => {
    const invoiceId = '44444444-4444-4444-8444-444444444444';
    jest.mocked(apiRequest).mockResolvedValue({ id: invoiceId, status: 'draft' });
    const body = {
      conversationId,
      proposalId,
      edits: { lines: [{ description: 'Plumbing', quantity: '3', rate: '80.00', unit: 'h', itemId: null }] },
    };
    await expect(saveAssistantDraft(body, 'tap-1')).resolves.toEqual({ id: invoiceId, status: 'draft' });
    expect(apiRequest).toHaveBeenCalledWith('/api/ai/assistant/drafts', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'tap-1' },
      body: JSON.stringify(body),
    });
  });

  it('posts a proposal preview and parses the server totals', async () => {
    const preview = {
      proposalId,
      date: '2026-11-10',
      dueDate: '2026-11-13',
      taxInclusive: true,
      taxRate: '10',
      lines: [{ description: 'Plumbing', quantity: '3', rate: '80.00', taxRate: '10', tax: '20.87', total: '240.00' }],
      subtotal: '219.13',
      taxAmount: '20.87',
      total: '240.00',
      errors: [],
    };
    jest.mocked(apiRequest).mockResolvedValue(preview);
    const signal = new AbortController().signal;
    const body = { conversationId, edits: { issueDate: '2026-11-10', taxRate: '10' } };
    await expect(previewAssistantProposal(proposalId, body, signal)).resolves.toEqual(preview);
    expect(apiRequest).toHaveBeenCalledWith(`/api/ai/assistant/proposals/${proposalId}/preview`, {
      method: 'POST',
      body: JSON.stringify(body),
      signal,
    });
  });
});
