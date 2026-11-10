import type { AssistantProposal, SaveAssistantDraftRequest } from '@ledgercraft/contracts';

export type ProposalLineDraft = {
  description: string;
  quantity: string;
  rate: string;
  unit: string;
  itemId: string | null;
};

export type ProposalDraft = {
  customerId: string | null;
  customerName: string;
  dueDate: string;
  taxInclusive: boolean | null;
  notes: string;
  lines: ProposalLineDraft[];
};

const day = /^\d{4}-\d{2}-\d{2}$/;
const money = /^\d+(\.\d+)?$/;

export function draftFromProposal(proposal: AssistantProposal): ProposalDraft {
  return {
    customerId: proposal.customerId,
    customerName: proposal.customerName ?? '',
    dueDate: proposal.dueDate ?? '',
    taxInclusive: proposal.taxInclusive,
    notes: proposal.notes ?? '',
    lines: proposal.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      rate: line.rate ?? '',
      unit: line.unit ?? '',
      itemId: line.itemId,
    })),
  };
}

export function linesReady(draft: ProposalDraft): boolean {
  return draft.lines.length > 0 && draft.lines.every((line) => line.description.trim().length > 0 && money.test(line.quantity) && money.test(line.rate));
}

export function linesChanged(proposal: AssistantProposal, draft: ProposalDraft): boolean {
  return draft.lines.length !== proposal.lines.length || draft.lines.some((line, index) => {
    const source = proposal.lines[index];
    if (!source) return true;
    return line.description !== source.description
      || line.quantity !== source.quantity
      || line.rate !== (source.rate ?? '')
      || line.unit !== (source.unit ?? '')
      || line.itemId !== source.itemId;
  });
}

export function customerNeedsPick(proposal: AssistantProposal, draft: ProposalDraft): boolean {
  return draft.customerName !== (proposal.customerName ?? '') && draft.customerId == null;
}

export function canSaveDraft(proposal: AssistantProposal, draft: ProposalDraft): boolean {
  if (customerNeedsPick(proposal, draft)) return false;
  if (linesChanged(proposal, draft) && !linesReady(draft)) return false;
  return true;
}

export function proposalIsDirty(proposal: AssistantProposal, draft: ProposalDraft): boolean {
  if (draft.customerId !== proposal.customerId) return true;
  if (draft.customerName !== (proposal.customerName ?? '')) return true;
  if (draft.dueDate !== (proposal.dueDate ?? '')) return true;
  if (draft.taxInclusive !== proposal.taxInclusive) return true;
  if (draft.notes !== (proposal.notes ?? '')) return true;
  return linesChanged(proposal, draft);
}

/**
 * POST /api/ai/assistant/drafts is the only merged route that reprices an edit,
 * and it also persists the draft. There is no preview response, so the card
 * cannot refresh server totals until that explicit save.
 */
export function editsForSave(proposal: AssistantProposal, draft: ProposalDraft): SaveAssistantDraftRequest['edits'] {
  const edits: NonNullable<SaveAssistantDraftRequest['edits']> = {};
  if (draft.customerId && draft.customerId !== proposal.customerId) edits.customerId = draft.customerId;
  if (day.test(draft.dueDate) && draft.dueDate !== proposal.dueDate) edits.dueDate = draft.dueDate;
  if (draft.taxInclusive != null && draft.taxInclusive !== proposal.taxInclusive) edits.taxInclusive = draft.taxInclusive;
  if (draft.notes !== (proposal.notes ?? '')) edits.notes = draft.notes.length > 0 ? draft.notes : null;
  if (linesChanged(proposal, draft) && linesReady(draft)) {
    edits.lines = draft.lines.map((line) => ({
      description: line.description.trim(),
      quantity: line.quantity,
      rate: line.rate,
      unit: line.unit.length > 0 ? line.unit : null,
      itemId: line.itemId,
    }));
  }
  return Object.keys(edits).length > 0 ? edits : undefined;
}
