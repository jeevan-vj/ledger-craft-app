import { describe, expect, it } from 'vitest';
import { ASSISTANT_HISTORY_CHARS, ASSISTANT_HISTORY_TURNS, assistantHistoryMessages, type AssistantHistoryRow } from './assistant.history';

const proposalId = '11111111-1111-4111-8111-111111111111';
const customerId = '22222222-2222-4222-8222-222222222222';

describe('assistant history messages', () => {
  it('keeps the latest turns, oldest first, with the proposal id and lines', () => {
    const rows: AssistantHistoryRow[] = Array.from({ length: ASSISTANT_HISTORY_TURNS + 2 }, (_, index) => ([
      { role: 'user', content: `prompt ${index}`, metadata: null },
      { role: 'assistant', content: `reply ${index}`, metadata: null },
    ])).flat();
    rows.push(
      { role: 'system', content: 'do not replay this role', metadata: null },
      {
        role: 'assistant',
        content: 'Some invoice details are still missing.',
        metadata: {
          kind: 'assistant_reply',
          parts: [
            { type: 'text', text: 'Some invoice details are still missing.' },
            {
              type: 'quick_picks',
              field: 'customerId',
              prompt: 'Which customer?',
              options: [{ id: customerId, label: 'Sarah Chen' }],
            },
            {
              type: 'proposal',
              proposal: {
                id: proposalId,
                status: 'needs_input',
                customerId: null,
                customerName: null,
                dueDate: '2026-11-13',
                taxInclusive: false,
                notes: 'DROP-LINES-NOTE',
                missing: ['customer'],
                lines: [{ description: 'Hours', quantity: '3', rate: '100.00' }],
              },
            },
          ],
        },
      },
    );
    const messages = assistantHistoryMessages(rows);
    expect(messages[0]?.content).toBe(`prompt ${2}`);
    expect(messages.some((message) => message.content.includes('prompt 0'))).toBe(false);
    expect(messages.some((message) => message.content.includes('prompt 1'))).toBe(false);
    expect(messages.some((message) => message.role === 'system')).toBe(false);
    expect(messages.some((message) => message.content.includes('do not replay'))).toBe(false);
    const summary = messages.map((message) => message.content).join('\n');
    expect(summary).toContain(proposalId);
    expect(summary).toContain('qty 3');
    expect(summary).toContain('rate 100.00');
    expect(summary).toContain(`Sarah Chen (${customerId})`);
    expect(summary).not.toContain('DROP-LINES-NOTE');
    expect(messages.at(-1)?.role).toBe('assistant');
  });

  it('drops older turns until the history fits the character budget', () => {
    const bulky = 'x'.repeat(ASSISTANT_HISTORY_CHARS);
    const messages = assistantHistoryMessages([
      { role: 'user', content: `old ${bulky}`, metadata: null },
      { role: 'assistant', content: 'old reply', metadata: null },
      { role: 'user', content: 'latest invoice lines', metadata: null },
      { role: 'assistant', content: 'latest reply', metadata: null },
    ] satisfies AssistantHistoryRow[]);
    expect(messages.map((message) => message.content)).toEqual(['latest invoice lines', 'latest reply']);
  });
});
