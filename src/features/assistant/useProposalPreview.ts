import { useEffect, useRef, useState } from 'react';
import {
  previewAssistantProposalRequestSchema,
  type AssistantProposal,
  type PreviewAssistantProposalResponse,
} from '@ledgercraft/contracts';
import { AssistantApiError, previewAssistantProposal } from './assistantApi';
import { editsForSave, proposalIsDirty, type ProposalDraft } from './assistantDraft';

export const ASSISTANT_PREVIEW_DEBOUNCE_MS = 400;

export type ProposalPreviewState =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'ready'; preview: PreviewAssistantProposalResponse }
  | { status: 'error'; message: string };

export function useProposalPreview(
  conversationId: string | undefined,
  proposal: AssistantProposal,
  draft: ProposalDraft,
): ProposalPreviewState {
  const [state, setState] = useState<ProposalPreviewState>({ status: 'idle' });
  const generation = useRef(0);
  const dirty = proposalIsDirty(proposal, draft);
  const signature = JSON.stringify(editsForSave(proposal, draft) ?? null);

  useEffect(() => {
    const requestId = ++generation.current;
    if (!conversationId || !dirty) {
      setState({ status: 'idle' });
      return undefined;
    }
    const edits = editsForSave(proposal, draft);
    if (!edits) {
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
          const message = error instanceof AssistantApiError
            ? error.message
            : 'The server could not reprice this edit. Totals stay unconfirmed.';
          setState({ status: 'error', message });
        });
    }, ASSISTANT_PREVIEW_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [conversationId, dirty, draft, proposal, signature]);

  return state;
}
