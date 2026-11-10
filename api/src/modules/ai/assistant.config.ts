import { decimal } from '../invoices/money';

export const ASSISTANT_DEFAULTS = {
  dailyMessages: 100,
  perMinute: 20,
  dailyCostUsd: '2.00',
  inputUsdPerMillion: '0.10',
  outputUsdPerMillion: '0.30',
  callReserveUsd: '0.05',
  maxSteps: 6,
  timeoutMs: 8_000,
  retentionDays: 90,
} as const;

export type AssistantLimits = {
  dailyMessages: number;
  perMinute: number;
  dailyCostUsd: string;
  inputUsdPerMillion: string;
  outputUsdPerMillion: string;
  callReserveUsd: string;
};

export type AssistantToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type AssistantModelMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
};

export type AssistantToolCall = { id: string; name: string; arguments: unknown };

export type AssistantModelTurn = {
  text?: string;
  toolCalls: AssistantToolCall[];
  inputTokens: number;
  outputTokens: number;
};

export type AssistantModel = {
  complete(input: {
    messages: AssistantModelMessage[];
    tools: readonly AssistantToolDefinition[];
    signal: AbortSignal;
  }): Promise<AssistantModelTurn>;
};

export type AssistantRuntime = {
  model?: AssistantModel;
  now?: Date;
  limits?: Partial<AssistantLimits>;
  maxSteps?: number;
  timeoutMs?: number;
  retentionDays?: number;
};

export function assistantLimitsFromEnv(env: NodeJS.ProcessEnv = process.env): AssistantLimits {
  const daily = Number(env.ASSISTANT_DAILY_MESSAGES ?? ASSISTANT_DEFAULTS.dailyMessages);
  const perMinute = Number(env.ASSISTANT_PER_MINUTE ?? ASSISTANT_DEFAULTS.perMinute);
  return {
    dailyMessages: Number.isFinite(daily) && daily >= 0 ? Math.floor(daily) : ASSISTANT_DEFAULTS.dailyMessages,
    perMinute: Number.isFinite(perMinute) && perMinute >= 0 ? Math.floor(perMinute) : ASSISTANT_DEFAULTS.perMinute,
    dailyCostUsd: env.ASSISTANT_DAILY_COST_USD || ASSISTANT_DEFAULTS.dailyCostUsd,
    inputUsdPerMillion: env.ASSISTANT_INPUT_USD_PER_MILLION || ASSISTANT_DEFAULTS.inputUsdPerMillion,
    outputUsdPerMillion: env.ASSISTANT_OUTPUT_USD_PER_MILLION || ASSISTANT_DEFAULTS.outputUsdPerMillion,
    callReserveUsd: env.ASSISTANT_CALL_RESERVE_USD || ASSISTANT_DEFAULTS.callReserveUsd,
  };
}

export function resolveLimits(runtime?: AssistantRuntime): AssistantLimits {
  return { ...assistantLimitsFromEnv(), ...runtime?.limits };
}

export function tokenCostUsd(inputTokens: number, outputTokens: number, limits: AssistantLimits): string {
  const cost = decimal(inputTokens).mul(limits.inputUsdPerMillion).div('1000000')
    .add(decimal(outputTokens).mul(limits.outputUsdPerMillion).div('1000000'));
  return cost.toFixed(6);
}

export function assistantEnabled(assistant: 'available' | 'unavailable' | undefined): boolean {
  return assistant === 'available';
}
