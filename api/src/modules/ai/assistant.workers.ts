import { apiError } from '../../http-error';
import type { AssistantModel, AssistantModelTurn, AssistantToolCall, AssistantToolDefinition } from './assistant.config';
import { gemmaToolCallsFromText, stripGemmaToolCalls } from './assistant.gemma';
import { ASSISTANT_WORKERS_AI_MODEL, type WorkersAiBinding } from './workers-ai';

const INVALID = 'The assistant returned an unusable response. Nothing was saved.';

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined;
}

function unwrap(response: unknown): Record<string, unknown> {
  const body = asRecord(response) ?? {};
  const result = asRecord(body.result);
  return result ?? body;
}

function argumentsOf(value: unknown): unknown {
  if (typeof value !== 'string') return value ?? {};
  try { return JSON.parse(value) as unknown; } catch { throw apiError(502, 'ASSISTANT_OUTPUT_INVALID', INVALID); }
}

function messageOf(body: Record<string, unknown>): Record<string, unknown> | undefined {
  return asRecord(asRecord((body.choices as unknown[] | undefined)?.[0])?.message);
}

function toolCallsOf(body: Record<string, unknown>): AssistantToolCall[] {
  const choice = messageOf(body);
  const direct = body.tool_calls ?? body.toolCalls;
  const nested = choice?.tool_calls ?? choice?.toolCalls;
  const legacy = asRecord(choice?.function_call);
  const calls = Array.isArray(direct) ? direct : Array.isArray(nested) ? nested : legacy ? [legacy] : [];
  return calls.map((call, index) => {
    const record = asRecord(call) ?? {};
    const fn = asRecord(record.function);
    const name = typeof record.name === 'string' ? record.name : typeof fn?.name === 'string' ? fn.name : '';
    const id = typeof record.id === 'string' ? record.id : `call_${index + 1}`;
    return { id, name, arguments: argumentsOf(record.arguments ?? fn?.arguments) };
  });
}

function textOf(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return undefined;
  const text = value.map((part) => {
    if (typeof part === 'string') return part;
    const record = asRecord(part);
    return typeof record?.text === 'string' ? record.text : '';
  }).join('');
  return text.length ? text : undefined;
}

function usageOf(body: Record<string, unknown>): { inputTokens: number; outputTokens: number } {
  const usage = asRecord(body.usage) ?? {};
  const input = Number(usage.prompt_tokens ?? usage.input_tokens ?? body.input_tokens ?? 0);
  const output = Number(usage.completion_tokens ?? usage.output_tokens ?? body.output_tokens ?? 0);
  return {
    inputTokens: Number.isFinite(input) && input > 0 ? Math.floor(input) : 0,
    outputTokens: Number.isFinite(output) && output > 0 ? Math.floor(output) : 0,
  };
}

export function workersAiToolRequest(tools: readonly AssistantToolDefinition[]) {
  return {
    tools: tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    })),
    tool_choice: 'auto' as const,
  };
}

export function redactAssistantLog(value: string): string {
  return value.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]').slice(0, 500);
}

export function logAssistantModelTurn(turn: AssistantModelTurn, env: { ASSISTANT_DEBUG?: string; NODE_ENV?: string } = process.env): void {
  if (env.ASSISTANT_DEBUG !== '1' || (env.NODE_ENV !== 'development' && env.NODE_ENV !== 'test')) return;
  console.info(JSON.stringify({
    source: 'assistant_model',
    toolCalls: turn.toolCalls.map((call) => call.name),
    text: redactAssistantLog(turn.text ?? ''),
  }));
}

export function parseWorkersAiAssistantTurn(response: unknown): AssistantModelTurn {
  const body = unwrap(response);
  let toolCalls = toolCallsOf(body);
  let text = textOf(body.response ?? body.text ?? messageOf(body)?.content);
  if (!toolCalls.length && text) {
    const gemma = gemmaToolCallsFromText(text);
    if (gemma.length) {
      toolCalls = gemma.map((call, index) => ({ id: `call_${index + 1}`, name: call.name, arguments: call.arguments }));
      const bare = text.trim().startsWith('call:');
      text = bare ? undefined : stripGemmaToolCalls(text);
    }
  }
  if (!toolCalls.length && text == null) {
    throw apiError(502, 'ASSISTANT_OUTPUT_INVALID', INVALID);
  }
  if (toolCalls.some((call) => !call.name)) {
    throw apiError(502, 'ASSISTANT_OUTPUT_INVALID', INVALID);
  }
  const usage = usageOf(body);
  return { text, toolCalls, ...usage };
}

export function createWorkersAiAssistantModel(
  ai: WorkersAiBinding,
  model = process.env.ASSISTANT_WORKERS_AI_MODEL || ASSISTANT_WORKERS_AI_MODEL,
): AssistantModel {
  return {
    async complete({ messages, tools, signal }) {
      const timedOut = () => apiError(504, 'ASSISTANT_TIMEOUT', 'The assistant took too long. Nothing was saved. Use Invoices to continue.');
      if (signal.aborted) throw timedOut();
      const response = await new Promise<unknown>((resolve, reject) => {
        const onAbort = () => reject(timedOut());
        signal.addEventListener('abort', onAbort, { once: true });
        Promise.resolve(ai.run(model, { messages, ...workersAiToolRequest(tools) }, { signal })).then(
          (value) => { signal.removeEventListener('abort', onAbort); resolve(value); },
          (error) => { signal.removeEventListener('abort', onAbort); reject(signal.aborted ? timedOut() : error); },
        );
      });
      try {
        const turn = parseWorkersAiAssistantTurn(response);
        logAssistantModelTurn(turn);
        return turn;
      } catch (error) {
        logAssistantModelTurn({ text: textOf(unwrap(response).response) ?? '', toolCalls: [], inputTokens: 0, outputTokens: 0 });
        throw error;
      }
    },
  };
}
