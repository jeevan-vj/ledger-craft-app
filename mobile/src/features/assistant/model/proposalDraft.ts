import type { AssistantProposal, SaveAssistantDraftRequest } from '@ledgercraft/contracts';

const money = /^\d+(\.\d+)?$/;
const day = /^\d{4}-\d{2}-\d{2}$/;

export type DraftLine = {
  description: string;
  quantity: string;
  rate: string;
  unit: string | null;
  itemId: string | null;
};

/** Local edits. Totals stay on the server proposal and are never computed here. */
export type ProposalDraft = {
  customerId: string | null;
  customerName: string | null;
  dueDate: string;
  taxInclusive: boolean | null;
  notes: string;
  lines: DraftLine[];
};

export function draftFromProposal(proposal: AssistantProposal): ProposalDraft {
  return {
    customerId: proposal.customerId,
    customerName: proposal.customerName,
    dueDate: proposal.dueDate ?? '',
    taxInclusive: proposal.taxInclusive,
    notes: proposal.notes ?? '',
    lines: proposal.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      rate: line.rate ?? '',
      unit: line.unit,
      itemId: line.itemId,
    })),
  };
}

export function draftReadyToSave(draft: ProposalDraft): boolean {
  if (!draft.customerId || !day.test(draft.dueDate) || draft.taxInclusive === null || draft.lines.length < 1) return false;
  return draft.lines.every((line) => line.description.trim().length > 0 && line.description.trim().length <= 200 && money.test(line.quantity) && money.test(line.rate));
}

export function applyCustomerPick(draft: ProposalDraft, id: string, label: string): ProposalDraft {
  return { ...draft, customerId: id, customerName: label };
}

export function buildSaveBody(conversationId: string, proposal: AssistantProposal, draft: ProposalDraft): SaveAssistantDraftRequest {
  const edits: NonNullable<SaveAssistantDraftRequest['edits']> = {};
  if (draft.customerId && draft.customerId !== proposal.customerId) edits.customerId = draft.customerId;
  if (day.test(draft.dueDate) && draft.dueDate !== proposal.dueDate) edits.dueDate = draft.dueDate;
  if (draft.taxInclusive !== null && draft.taxInclusive !== proposal.taxInclusive) edits.taxInclusive = draft.taxInclusive;
  const notes = draft.notes.trim();
  if (notes !== (proposal.notes ?? '')) edits.notes = notes.length ? notes : null;
  const linesChanged = draft.lines.length !== proposal.lines.length || draft.lines.some((line, index) => {
    const source = proposal.lines[index];
    return line.description.trim() !== source?.description
      || line.quantity !== source?.quantity
      || line.rate !== (source?.rate ?? '')
      || line.itemId !== source?.itemId
      || line.unit !== source?.unit;
  });
  if (linesChanged) {
    edits.lines = draft.lines.map((line) => ({
      description: line.description.trim(),
      quantity: line.quantity,
      rate: line.rate,
      unit: line.unit,
      itemId: line.itemId,
    }));
  }
  return Object.keys(edits).length
    ? { conversationId, proposalId: proposal.id, edits }
    : { conversationId, proposalId: proposal.id };
}

export function draftHasEdits(proposal: AssistantProposal, draft: ProposalDraft): boolean {
  return buildSaveBody(proposal.id, proposal, draft).edits !== undefined;
}
