import { describe, expect, it } from 'vitest';
import { parseWorkersAiAssistantTurn } from './assistant.workers';

describe('Workers AI assistant parser', () => {
  it('reads tool calls from a Workers AI result envelope', () => {
    const turn = parseWorkersAiAssistantTurn({
      result: {
        response: 'Looking up Sarah.',
        tool_calls: [{ name: 'search_customers', arguments: { query: 'Sarah' } }],
        usage: { prompt_tokens: 12, completion_tokens: 4 },
      },
    });
    expect(turn.toolCalls).toEqual([{ id: 'call_1', name: 'search_customers', arguments: { query: 'Sarah' } }]);
    expect(turn.inputTokens).toBe(12);
    expect(turn.outputTokens).toBe(4);
  });

  it('reads OpenAI-style tool calls and string arguments', () => {
    const turn = parseWorkersAiAssistantTurn({
      choices: [{ message: { content: '', tool_calls: [{ id: 'a', function: { name: 'list_outstanding', arguments: '{}' } }] } }],
    });
    expect(turn.toolCalls).toEqual([{ id: 'a', name: 'list_outstanding', arguments: {} }]);
  });

  it('rejects a response with no text and no tools', () => {
    expect(() => parseWorkersAiAssistantTurn({ response: { noise: true } })).toThrow(/unusable response/);
  });
});
