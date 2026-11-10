import { useEffect, useRef, useState } from 'react';
import {
  previewAssistantProposalRequestSchema,
  type AssistantProposal,
  type PreviewAssistantProposalResponse,
} from '@ledgercraft/contracts';
import { AuthApiError } from '@/features/auth/api/http';
import { previewAssistantProposal } from '@/features/assistant/api/assistantApi';
import { draftHasEdits, formatBlocksPreview, saveEdits, type ProposalDraft } from './proposalDraft';

export const ASSISTANT_PREVIEW_DEBOUNCE_MS = 400;

export type ProposalPreviewState =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'ready'; preview: PreviewAssistantProposalResponse }
  | { status: 'error'; message: string };

const PREVIEW_CODES = new Set([
  'ASSISTANT_PREVIEW_LIMIT',
  'ASSISTANT_DISABLED',
  'ASSISTANT_UNAVAILABLE',
  'NOT_FOUND',
  'VALIDATION_ERROR',
]);

function previewMessage(error: unknown): string {
  if (error instanceof AuthApiError && error.code && PREVIEW_CODES.has(error.code)) return error.message;
  return 'The server could not reprice this edit. Totals stay unconfirmed.';
}

export function useProposalPreview(
  conversationId: string | undefined,
  proposal: AssistantProposal,
  draft: ProposalDraft,
): ProposalPreviewState {
  const [state, setState] = useState<ProposalPreviewState>({ status: 'idle' });
  const generation = useRef(0);
  const dirty = draftHasEdits(proposal, draft);
  const signature = JSON.stringify(saveEdits(proposal, draft) ?? null);

  useEffect(() => {
    const requestId = ++generation.current;
    const edits = saveEdits(proposal, draft);
    if (!conversationId || !dirty || !edits || formatBlocksPreview(proposal, draft)) {
      setState({ status: 'idle' });
      return undefined;
    }
    const parsed = previewAssistantProposalRequestSchema.safeParse({ conversationId, edits });
    if (!parsed.success) {
      setState({ status: 'error', message: parsed.error.issues[0]?.message ?? 'Check the invoice fields.' });
      return undefined;
    }
    const controller = new AbortController();
    setState({ status: 'pending' });
    const timer = setTimeout(() => {
      void previewAssistantProposal(proposal.id, parsed.data, controller.signal)
        .then((preview) => {
          if (requestId !== generation.current || controller.signal.aborted) return;
          setState({ status: 'ready', preview });
        })
        .catch((error: unknown) => {
          if (requestId !== generation.current || controller.signal.aborted) return;
          if (error instanceof Error && error.name === 'AbortError') return;
          setState({ status: 'error', message: previewMessage(error) });
        });
    }, ASSISTANT_PREVIEW_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [conversationId, dirty, draft, proposal, signature]);

  return state;
}
