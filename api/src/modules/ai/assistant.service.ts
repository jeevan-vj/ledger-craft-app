import type { AssistantTurnRequest, AssistantTurnResponse } from '@ledgercraft/contracts';
import type { Database } from '../../db/client';
import { apiError } from '../../http-error';
import { withOrganisationTx } from '../auth/bind-organisation';
import type { AppCapabilities } from '../../types';
import { ASSISTANT_DEFAULTS, assistantEnabled, resolveLimits, tokenCostUsd, type AssistantRuntime } from './assistant.config';
import { runAssistantLoop } from './assistant.loop';
import {
  ensureAssistantConversation,
  insertAssistantEvent,
  purgeAssistantRetention,
  storeAssistantTurn,
  updateAssistantEvent,
  usageSince,
  type AssistantOutcome,
} from './assistant.store';

const DISABLED = 'The assistant is turned off. Use Invoices to continue.';
const UNAVAILABLE = 'The assistant is not configured.';
const LIMITED = 'Assistant limit reached for this business. Use Invoices to continue.';

function assertEnabled(capabilities?: AppCapabilities) {
  if (!assistantEnabled(capabilities?.assistant)) throw apiError(403, 'ASSISTANT_DISABLED', DISABLED);
}

export async function completeAssistantForUser(
  db: Database,
  userId: string,
  input: AssistantTurnRequest,
  runtime: AssistantRuntime | undefined,
  capabilities: AppCapabilities | undefined,
  requestId: string,
): Promise<AssistantTurnResponse> {
  assertEnabled(capabilities);
  if (!runtime?.model) throw apiError(503, 'ASSISTANT_UNAVAILABLE', UNAVAILABLE);
  const limits = resolveLimits(runtime);
  const now = runtime.now ?? new Date();
  const retentionDays = runtime.retentionDays ?? ASSISTANT_DEFAULTS.retentionDays;
  const gate = await withOrganisationTx(db, userId, async (tx, ctx) => {
    await purgeAssistantRetention(tx, ctx.organisationId, now, retentionDays);
    const usage = await usageSince(tx, ctx.organisationId, now);
    if (usage.day >= limits.dailyMessages || usage.minute >= limits.perMinute || usage.cost.compare(limits.dailyCostUsd) >= 0) {
      await insertAssistantEvent(tx, { organisationId: ctx.organisationId, userId, requestId, action: 'turn', outcome: 'limit' });
      return { blocked: true as const };
    }
    const conversationId = await ensureAssistantConversation(tx, ctx, input.conversationId);
    if (!conversationId) return { blocked: false as const, missing: true as const };
    const eventId = await insertAssistantEvent(tx, { organisationId: ctx.organisationId, userId, requestId, action: 'turn', outcome: 'reply' });
    return { blocked: false as const, missing: false as const, organisationId: ctx.organisationId, conversationId, eventId };
  });
  if (gate.blocked) throw apiError(429, 'ASSISTANT_LIMIT', LIMITED);
  if (gate.missing) throw apiError(404, 'NOT_FOUND', 'Conversation not found');

  try {
    const loop = await runAssistantLoop({
      db,
      userId,
      message: input.message,
      model: runtime.model,
      now,
      maxSteps: Math.min(runtime.maxSteps ?? ASSISTANT_DEFAULTS.maxSteps, 8),
      timeoutMs: Math.min(runtime.timeoutMs ?? ASSISTANT_DEFAULTS.timeoutMs, 15_000),
    });
    const costUsd = tokenCostUsd(loop.inputTokens, loop.outputTokens, limits);
    const response = await withOrganisationTx(db, userId, async (tx, ctx) => {
      await updateAssistantEvent(tx, ctx.organisationId, gate.eventId, {
        outcome: loop.outcome,
        toolNames: loop.toolNames,
        inputTokens: loop.inputTokens,
        outputTokens: loop.outputTokens,
        costUsd,
      });
      await storeAssistantTurn(tx, ctx, {
        conversationId: gate.conversationId,
        prompt: input.message,
        parts: loop.parts,
      });
      return { conversationId: gate.conversationId, parts: loop.parts };
    });
    return response;
  } catch (error) {
    const outcome = failureOutcome(error);
    if (outcome) {
      await withOrganisationTx(db, userId, (tx, ctx) => updateAssistantEvent(tx, ctx.organisationId, gate.eventId, {
        outcome, toolNames: [], inputTokens: 0, outputTokens: 0, costUsd: '0.000000',
      }));
    }
    throw error;
  }
}

function failureOutcome(error: unknown): Extract<AssistantOutcome, 'timeout' | 'invalid_output'> | undefined {
  if (!(error instanceof Error)) return undefined;
  const http = error as { cause?: { code?: string } };
  if (http.cause?.code === 'ASSISTANT_TIMEOUT') return 'timeout';
  if (http.cause?.code === 'ASSISTANT_OUTPUT_INVALID') return 'invalid_output';
  return undefined;
}
