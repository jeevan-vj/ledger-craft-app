import { afterEach, describe, expect, it, vi } from 'vitest';
import { ASSISTANT_TOOL_DEFINITIONS } from './assistant.tools';
import { createWorkersAiAssistantModel, logAssistantModelTurn, parseWorkersAiAssistantTurn, workersAiToolRequest } from './assistant.workers';

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

  it('reads a Gemma tool call from the reply text, including nested lines', () => {
    const turn = parseWorkersAiAssistantTurn({
      result: {
        response: '<|tool_call>call:prepare_invoice_proposal{customerQuery:<|"|>Sarah Chen<|"|>,dueDate:<|"|>Friday<|"|>,taxInclusive:false,notes:<|"|>a}, b<|"|>,lines:[{description:<|"|>Hours<|"|>,quantity:<|"|>3<|"|>,rate:<|"|>100.00<|"|>}]}<tool_call|>',
        usage: { prompt_tokens: 30, completion_tokens: 12 },
      },
    });
    expect(turn.toolCalls).toEqual([{
      id: 'call_1',
      name: 'prepare_invoice_proposal',
      arguments: {
        customerQuery: 'Sarah Chen',
        dueDate: 'Friday',
        taxInclusive: false,
        notes: 'a}, b',
        lines: [{ description: 'Hours', quantity: '3', rate: '100.00' }],
      },
    }]);
    expect(turn.text).toBeUndefined();
    expect(turn.inputTokens).toBe(30);
  });

  it('reads a bare Gemma call and an OpenAI function_call, and leaves ordinary prose alone', () => {
    const bare = parseWorkersAiAssistantTurn({
      response: 'call:list_outstanding{}',
    });
    expect(bare.toolCalls).toEqual([{ id: 'call_1', name: 'list_outstanding', arguments: {} }]);

    const legacy = parseWorkersAiAssistantTurn({
      choices: [{ message: { content: null, function_call: { name: 'search_customers', arguments: '{"query":"Sarah"}' } } }],
    });
    expect(legacy.toolCalls).toEqual([{ id: 'call_1', name: 'search_customers', arguments: { query: 'Sarah' } }]);

    const prose = parseWorkersAiAssistantTurn({
      response: 'I can draft that invoice. call:prepare_invoice_proposal{lines:[]} is not a request.',
    });
    expect(prose.toolCalls).toEqual([]);
    expect(prose.text).toContain('draft that invoice');
  });

  it('reads tool-call text from a content array', () => {
    const turn = parseWorkersAiAssistantTurn({
      choices: [{ message: { content: [{ type: 'text', text: '<|tool_call>call:search_catalogue{query:<|"|>filter<|"|>}<tool_call|>' }] } }],
    });
    expect(turn.toolCalls).toEqual([{ id: 'call_1', name: 'search_catalogue', arguments: { query: 'filter' } }]);
  });

  it('sends Gemma an OpenAI function tool list and tool_choice auto', async () => {
    let payload: unknown;
    const model = createWorkersAiAssistantModel({
      run: (_model, input) => {
        payload = input;
        return Promise.resolve({
          choices: [{ message: { content: '<|tool_call>call:prepare_invoice_proposal{taxInclusive:false,lines:[{description:<|"|>Hours<|"|>,quantity:3,rate:100}]}<tool_call|>' } }],
        });
      },
    });
    const turn = await model.complete({
      messages: [{ role: 'user', content: 'Invoice Sarah Chen for 3 hours at $100 plus GST, due Friday' }],
      tools: ASSISTANT_TOOL_DEFINITIONS,
      signal: new AbortController().signal,
    });
    expect(payload).toMatchObject({ tool_choice: 'auto' });
    expect(workersAiToolRequest(ASSISTANT_TOOL_DEFINITIONS).tools).toEqual(
      (payload as { tools: unknown }).tools,
    );
    const invoice = workersAiToolRequest(ASSISTANT_TOOL_DEFINITIONS).tools.find((tool) => tool.function.name === 'prepare_invoice_proposal');
    expect(JSON.stringify(invoice?.function.parameters)).toContain('quantity');
    expect(JSON.stringify(invoice?.function.parameters)).toContain('taxInclusive');
    expect(turn.toolCalls[0]).toMatchObject({
      name: 'prepare_invoice_proposal',
      arguments: { taxInclusive: false, lines: [{ description: 'Hours', quantity: 3, rate: 100 }] },
    });
  });

  it('logs the reply text and tool names only outside production when debug is on', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    logAssistantModelTurn(
      { text: 'Invoice owner@example.test', toolCalls: [{ id: 'call_1', name: 'prepare_invoice_proposal', arguments: { customerQuery: 'Sarah' } }], inputTokens: 1, outputTokens: 1 },
      { ASSISTANT_DEBUG: '1', NODE_ENV: 'test' },
    );
    logAssistantModelTurn(
      { text: 'hidden', toolCalls: [{ id: 'call_1', name: 'list_outstanding', arguments: {} }], inputTokens: 1, outputTokens: 1 },
      { ASSISTANT_DEBUG: '1', NODE_ENV: 'production' },
    );
    expect(info).toHaveBeenCalledTimes(1);
    const line = String(info.mock.calls[0]?.[0]);
    expect(line).toContain('prepare_invoice_proposal');
    expect(line).toContain('[email]');
    expect(line).not.toContain('owner@example.test');
    expect(line).not.toContain('Sarah');
    info.mockRestore();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
