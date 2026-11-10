import { describe, expect, it } from 'vitest';
import { ASSISTANT_DEFAULTS, resolveAssistantTurnBudget } from './assistant.config';
import { assistantToolCallKey, dedupeAssistantParts, isExpenseRequest } from './assistant.loop';

describe('assistant turn budget', () => {
  it('defaults to 30 seconds and keeps a shorter configured timeout', () => {
    expect(ASSISTANT_DEFAULTS.timeoutMs).toBe(30_000);
    expect(resolveAssistantTurnBudget(undefined).timeoutMs).toBe(30_000);
    expect(resolveAssistantTurnBudget({ timeoutMs: 20_000 }).timeoutMs).toBe(20_000);
    expect(resolveAssistantTurnBudget({ timeoutMs: 45_000 }).timeoutMs).toBe(30_000);
  });

  it('caps a turn at four model steps', () => {
    expect(ASSISTANT_DEFAULTS.maxSteps).toBe(4);
    expect(resolveAssistantTurnBudget({ maxSteps: 6 }).maxSteps).toBe(4);
    expect(resolveAssistantTurnBudget({ maxSteps: 2 }).maxSteps).toBe(2);
  });
});

describe('assistant expense intent', () => {
  it('treats an expense request as an expense and leaves invoice prompts alone', () => {
    expect(isExpenseRequest('Add a $45 fuel expense')).toBe(true);
    expect(isExpenseRequest('ADD AN EXPENSE for fuel')).toBe(true);
    expect(isExpenseRequest('Invoice Sarah for 3 hours at $100 including GST, due 2026-11-13')).toBe(false);
    expect(isExpenseRequest('Who owes me money?')).toBe(false);
    expect(isExpenseRequest('The inexpensive filter')).toBe(false);
  });
});

describe('assistant repeated tool results', () => {
  it('keeps the first copy of identical parts', () => {
    const text = { type: 'text' as const, text: 'No outstanding invoices.' };
    const link = { type: 'link' as const, href: '/invoices', label: 'Invoices' };
    const picks = {
      type: 'quick_picks' as const,
      field: 'customerId' as const,
      prompt: 'Which customer?',
      options: [{ id: '8c0b6a6e-3e3a-4f0e-9a1c-6d5b4a3c2d1e', label: 'Sarah Chen' }],
    };
    expect(dedupeAssistantParts([text, link, text, link, picks, picks])).toEqual([text, link, picks]);
  });

  it('treats the same tool arguments as one call regardless of key order', () => {
    expect(assistantToolCallKey('search_customers', { query: 'Sarah', extra: '1' }))
      .toBe(assistantToolCallKey('search_customers', { extra: '1', query: 'Sarah' }));
    expect(assistantToolCallKey('list_outstanding', {}))
      .not.toBe(assistantToolCallKey('search_customers', {}));
    expect(assistantToolCallKey('search_customers', { query: 'Sarah' }))
      .not.toBe(assistantToolCallKey('search_customers', { query: 'Jones' }));
  });
});
