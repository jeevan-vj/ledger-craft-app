import {
  assistantTurnRequestSchema,
  assistantTurnResponseSchema,
  invoiceSchema,
  previewAssistantProposalRequestSchema,
  previewAssistantProposalResponseSchema,
  saveAssistantDraftRequestSchema,
  type AssistantTurnRequest,
  type AssistantTurnResponse,
  type PreviewAssistantProposalRequest,
  type PreviewAssistantProposalResponse,
  type SaveAssistantDraftRequest,
} from '@ledgercraft/contracts';
import { apiRequest } from '@/features/auth/api/http';

const savedDraftSchema = invoiceSchema.pick({ id: true, status: true });

export type SavedAssistantDraft = { id: string; status: string };

export async function askAssistant(input: AssistantTurnRequest, signal?: AbortSignal): Promise<AssistantTurnResponse> {
  const body = assistantTurnRequestSchema.parse(input);
  const response = await apiRequest<unknown>('/api/ai/assistant', {
    method: 'POST',
    body: JSON.stringify(body),
    signal,
  });
  return assistantTurnResponseSchema.parse(response);
}

export async function saveAssistantDraft(input: SaveAssistantDraftRequest, idempotencyKey: string): Promise<SavedAssistantDraft> {
  const body = saveAssistantDraftRequestSchema.parse(input);
  const response = await apiRequest<unknown>('/api/ai/assistant/drafts', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(body),
  });
  return savedDraftSchema.parse(response);
}

export async function previewAssistantProposal(
  proposalId: string,
  input: PreviewAssistantProposalRequest,
  signal?: AbortSignal,
): Promise<PreviewAssistantProposalResponse> {
  const body = previewAssistantProposalRequestSchema.parse(input);
  const response = await apiRequest<unknown>(`/api/ai/assistant/proposals/${encodeURIComponent(proposalId)}/preview`, {
    method: 'POST',
    body: JSON.stringify(body),
    signal,
  });
  return previewAssistantProposalResponseSchema.parse(response);
}
