import { apiRequest } from '@/features/auth/api/http';
import { askAssistant, saveAssistantDraft } from './assistantApi';


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
});
