import {
  assistantTurnRequestSchema,
  assistantTurnResponseSchema,
  errorEnvelopeSchema,
  previewAssistantProposalRequestSchema,
  previewAssistantProposalResponseSchema,
  saveAssistantDraftRequestSchema,
  type AssistantTurnRequest,
  type AssistantTurnResponse,
  type PreviewAssistantProposalRequest,
  type PreviewAssistantProposalResponse,
  type SaveAssistantDraftRequest,
} from '@ledgercraft/contracts';
import { z } from 'zod';

const savedDraftSchema = z.object({ id: z.string().uuid() });

const USER_MESSAGES = new Set([
  'ASSISTANT_LIMIT',
  'ASSISTANT_TIMEOUT',
  'ASSISTANT_OUTPUT_INVALID',
  'ASSISTANT_DISABLED',
  'ASSISTANT_UNAVAILABLE',
  'NOT_FOUND',
  'PROPOSAL_INCOMPLETE',
]);

const PREVIEW_MESSAGES = new Set([
  'ASSISTANT_PREVIEW_LIMIT',
  'ASSISTANT_DISABLED',
  'ASSISTANT_UNAVAILABLE',
  'NOT_FOUND',
  'VALIDATION_ERROR',
]);

export class AssistantApiError extends Error {
  readonly code?: string;

  constructor(message: string, readonly status: number, code?: string) {
    super(message);
    this.name = 'AssistantApiError';
    this.code = code;
  }
}

async function failure(response: Response): Promise<AssistantApiError> {
  let code: string | undefined;
  let message = 'The assistant could not complete that. Nothing was saved.';
  try {
    const body = errorEnvelopeSchema.parse(await response.json());
    code = body.error.code;
    if (USER_MESSAGES.has(code)) message = body.error.message;
  } catch {
    // A non-envelope body keeps the generic assistant message.
  }
  return new AssistantApiError(message, response.status, code);
}

export async function askAssistant(input: AssistantTurnRequest, signal?: AbortSignal): Promise<AssistantTurnResponse> {
  const response = await fetch('/api/ai/assistant', {
    method: 'POST',
    credentials: 'include',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(assistantTurnRequestSchema.parse(input)),
  });
  if (!response.ok) throw await failure(response);
  const parsed = assistantTurnResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new AssistantApiError('The assistant returned an unusable response. Nothing was saved.', response.status, 'ASSISTANT_OUTPUT_INVALID');
  }
  return parsed.data;
}

export async function saveAssistantDraft(input: SaveAssistantDraftRequest, idempotencyKey: string) {
  const response = await fetch('/api/ai/assistant/drafts', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(saveAssistantDraftRequestSchema.parse(input)),
  });
  if (!response.ok) throw await failure(response);
  const parsed = savedDraftSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new AssistantApiError('The draft could not be opened. Nothing else was changed.', response.status);
  }
  return parsed.data;
}

const UNCONFIRMED = 'The server could not reprice this edit. Totals stay unconfirmed.';

export async function previewAssistantProposal(
  proposalId: string,
  input: PreviewAssistantProposalRequest,
  signal?: AbortSignal,
): Promise<PreviewAssistantProposalResponse> {
  const response = await fetch(`/api/ai/assistant/proposals/${encodeURIComponent(proposalId)}/preview`, {
    method: 'POST',
    credentials: 'include',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(previewAssistantProposalRequestSchema.parse(input)),
  });
  if (!response.ok) throw await previewFailure(response);
  const parsed = previewAssistantProposalResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new AssistantApiError(UNCONFIRMED, response.status);
  return parsed.data;
}

async function previewFailure(response: Response): Promise<AssistantApiError> {
  let code: string | undefined;
  let message = UNCONFIRMED;
  try {
    const body = errorEnvelopeSchema.parse(await response.json());
    code = body.error.code;
    if (PREVIEW_MESSAGES.has(code)) message = body.error.message;
  } catch {
    // A non-envelope body keeps the unconfirmed preview message.
  }
  return new AssistantApiError(message, response.status, code);
}
