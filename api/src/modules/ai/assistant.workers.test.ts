import { describe, expect, it } from 'vitest';
import { createWorkersAiAssistantModel, parseWorkersAiAssistantTurn } from './assistant.workers';

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

  it('passes the abort signal into the provider call and stops when it fires', async () => {
    const controller = new AbortController();
    let seen: AbortSignal | undefined;
    const model = createWorkersAiAssistantModel({
      run: (_model, _input, options) => new Promise((_resolve, reject) => {
        seen = options?.signal;
        options?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      }),
    });
    const pending = model.complete({ messages: [{ role: 'user', content: 'Hello' }], tools: [], signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toThrow(/too long/);
    expect(seen?.aborted).toBe(true);
  });

  it('rejects a response with no text and no tools', () => {
    expect(() => parseWorkersAiAssistantTurn({ response: { noise: true } })).toThrow(/unusable response/);
  });
});
