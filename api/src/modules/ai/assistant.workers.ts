import { apiError } from '../../http-error';
import type { AssistantModel, AssistantModelTurn, AssistantToolCall } from './assistant.config';
import { ASSISTANT_WORKERS_AI_MODEL, type WorkersAiBinding } from './workers-ai';

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
  try { return JSON.parse(value) as unknown; } catch { throw apiError(502, 'ASSISTANT_OUTPUT_INVALID', 'The assistant returned an unusable response. Nothing was saved.'); }
}

function toolCallsOf(body: Record<string, unknown>): AssistantToolCall[] {
  const direct = body.tool_calls ?? body.toolCalls;
  const choice = asRecord(asRecord((body.choices as unknown[] | undefined)?.[0])?.message);
  const nested = choice?.tool_calls ?? choice?.toolCalls;
  const calls = Array.isArray(direct) ? direct : Array.isArray(nested) ? nested : [];
  return calls.map((call, index) => {
    const record = asRecord(call) ?? {};
    const fn = asRecord(record.function);
    const name = typeof record.name === 'string' ? record.name : typeof fn?.name === 'string' ? fn.name : '';
    const id = typeof record.id === 'string' ? record.id : `call_${index + 1}`;
    return { id, name, arguments: argumentsOf(record.arguments ?? fn?.arguments) };
  });
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

export function parseWorkersAiAssistantTurn(response: unknown): AssistantModelTurn {
  const body = unwrap(response);
  const toolCalls = toolCallsOf(body);
  const textValue = body.response ?? body.text ?? asRecord(asRecord((body.choices as unknown[] | undefined)?.[0])?.message)?.content;
  const text = typeof textValue === 'string' ? textValue : undefined;
  if (!toolCalls.length && text == null) {
    throw apiError(502, 'ASSISTANT_OUTPUT_INVALID', 'The assistant returned an unusable response. Nothing was saved.');
  }
  if (toolCalls.some((call) => !call.name)) {
    throw apiError(502, 'ASSISTANT_OUTPUT_INVALID', 'The assistant returned an unusable response. Nothing was saved.');
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
        Promise.resolve(ai.run(model, { messages, tools }, { signal })).then(
          (value) => { signal.removeEventListener('abort', onAbort); resolve(value); },
          (error) => { signal.removeEventListener('abort', onAbort); reject(signal.aborted ? timedOut() : error); },
        );
      });
      return parseWorkersAiAssistantTurn(response);
    },
  };
}
