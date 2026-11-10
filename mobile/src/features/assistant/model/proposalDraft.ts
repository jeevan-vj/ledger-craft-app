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
  issueDate: string;
  dueDate: string;
  taxInclusive: boolean | null;
  taxRate: string;
  notes: string;
  lines: DraftLine[];
};

export function realCalendarDay(value: string): boolean {
  if (!day.test(value)) return false;
  const [year, month, dayOfMonth] = value.split('-').map(Number);
  if (year === undefined || month === undefined || dayOfMonth === undefined) return false;
  const date = new Date(Date.UTC(year, month - 1, dayOfMonth));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === dayOfMonth;
}

export function validTaxRate(value: string): boolean {
  return money.test(value) && Number(value) >= 0 && Number(value) <= 100;
}

export const DATE_FORMAT_MESSAGE = 'Enter a real date';
export const GST_RATE_FORMAT_MESSAGE = 'Enter a GST rate from 0 to 100';

export function issueDateFormatError(proposalDate: string, value: string): string | undefined {
  if (value === proposalDate || realCalendarDay(value)) return undefined;
  return DATE_FORMAT_MESSAGE;
}

export function dueDateFormatError(proposalDue: string | null, value: string): string | undefined {
  if (value === (proposalDue ?? '') || realCalendarDay(value)) return undefined;
  return DATE_FORMAT_MESSAGE;
}

export function taxRateFormatError(proposalRate: string, value: string): string | undefined {
  if (value === proposalRate || validTaxRate(value)) return undefined;
  return GST_RATE_FORMAT_MESSAGE;
}

export function formatBlocksPreview(proposal: AssistantProposal, draft: ProposalDraft): boolean {
  return Boolean(
    issueDateFormatError(proposal.date, draft.issueDate)
    || dueDateFormatError(proposal.dueDate, draft.dueDate)
    || taxRateFormatError(proposal.taxRate, draft.taxRate),
  );
}

export function screenMatchesPricedPreview(
  proposal: AssistantProposal,
  draft: ProposalDraft,
  priced: { date: string; dueDate: string | null; taxRate: string },
): boolean {
  if (formatBlocksPreview(proposal, draft)) return false;
  return priced.date === draft.issueDate
    && priced.taxRate === draft.taxRate
    && (priced.dueDate ?? '') === draft.dueDate;
}

export function draftFromProposal(proposal: AssistantProposal): ProposalDraft {
  return {
    customerId: proposal.customerId,
    customerName: proposal.customerName,
    issueDate: proposal.date,
    dueDate: proposal.dueDate ?? '',
    taxInclusive: proposal.taxInclusive,
    taxRate: proposal.taxRate,
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
  if (!draft.customerId || draft.taxInclusive === null || draft.lines.length < 1) return false;
  if (!realCalendarDay(draft.issueDate) || !realCalendarDay(draft.dueDate) || draft.dueDate < draft.issueDate) return false;
  if (!validTaxRate(draft.taxRate)) return false;
  return draft.lines.every((line) => line.description.trim().length > 0 && line.description.trim().length <= 200 && money.test(line.quantity) && money.test(line.rate));
}

export function applyCustomerPick(draft: ProposalDraft, id: string, label: string): ProposalDraft {
  return { ...draft, customerId: id, customerName: label };
}

export function saveEdits(proposal: AssistantProposal, draft: ProposalDraft): SaveAssistantDraftRequest['edits'] {
  const edits: NonNullable<SaveAssistantDraftRequest['edits']> = {};
  if (draft.customerId && draft.customerId !== proposal.customerId) edits.customerId = draft.customerId;
  if (realCalendarDay(draft.issueDate) && draft.issueDate !== proposal.date) edits.issueDate = draft.issueDate;
  if (realCalendarDay(draft.dueDate) && draft.dueDate !== proposal.dueDate) edits.dueDate = draft.dueDate;
  if (draft.taxInclusive !== null && draft.taxInclusive !== proposal.taxInclusive) edits.taxInclusive = draft.taxInclusive;
  if (validTaxRate(draft.taxRate) && draft.taxRate !== proposal.taxRate) edits.taxRate = draft.taxRate;
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
  return Object.keys(edits).length > 0 ? edits : undefined;
}

export function buildSaveBody(conversationId: string, proposal: AssistantProposal, draft: ProposalDraft): SaveAssistantDraftRequest {
  const edits = saveEdits(proposal, draft);
  return edits ? { conversationId, proposalId: proposal.id, edits } : { conversationId, proposalId: proposal.id };
}

export function draftHasEdits(proposal: AssistantProposal, draft: ProposalDraft): boolean {
  if (draft.customerId !== proposal.customerId) return true;
  if ((draft.customerName ?? '') !== (proposal.customerName ?? '')) return true;
  if (draft.issueDate !== proposal.date) return true;
  if (draft.dueDate !== (proposal.dueDate ?? '')) return true;
  if (draft.taxInclusive !== proposal.taxInclusive) return true;
  if (draft.taxRate !== proposal.taxRate) return true;
  if (draft.notes.trim() !== (proposal.notes ?? '')) return true;
  return draft.lines.length !== proposal.lines.length || draft.lines.some((line, index) => {
    const source = proposal.lines[index];
    return line.description.trim() !== source?.description
      || line.quantity !== source?.quantity
      || line.rate !== (source?.rate ?? '')
      || line.itemId !== source?.itemId
      || line.unit !== source?.unit;
  });
}
