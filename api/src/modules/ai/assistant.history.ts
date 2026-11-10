import type { AssistantModelMessage } from './assistant.config';

export const ASSISTANT_HISTORY_TURNS = 8;
export const ASSISTANT_HISTORY_CHARS = 4_000;

export type AssistantHistoryRow = {
  role: string;
  content: string;
  metadata: unknown;
};

export function assistantHistoryMessages(rows: readonly AssistantHistoryRow[]): AssistantModelMessage[] {
  const turns: AssistantModelMessage[][] = [];
  let current: AssistantModelMessage[] | null = null;
  for (const row of rows) {
    if (row.role === 'user') {
      current = [{ role: 'user', content: row.content.trim() }];
      turns.push(current);
      continue;
    }
    if (row.role !== 'assistant') continue;
    const message: AssistantModelMessage = { role: 'assistant', content: summarizeAssistant(row) };
    if (current) current.push(message);
    else {
      current = [message];
      turns.push(current);
    }
  }
  const kept = turns.slice(-ASSISTANT_HISTORY_TURNS);
  while (kept.length > 1 && turnChars(kept) > ASSISTANT_HISTORY_CHARS) kept.shift();
  const flat = kept.flat().filter((message) => message.content.length > 0);
  let used = flat.reduce((sum, message) => sum + message.content.length, 0);
  for (let index = 0; index < flat.length && used > ASSISTANT_HISTORY_CHARS; index += 1) {
    const message = flat[index];
    const overflow = used - ASSISTANT_HISTORY_CHARS;
    const next = message.content.slice(overflow);
    used -= message.content.length - next.length;
    flat[index] = { ...message, content: next };
  }
  return flat.filter((message) => message.content.length > 0);
}

function turnChars(turns: readonly AssistantModelMessage[][]): number {
  return turns.reduce((sum, turn) => sum + turn.reduce((inner, message) => inner + message.content.length, 0), 0);
}

function summarizeAssistant(row: AssistantHistoryRow): string {
  const bits: string[] = [];
  const content = row.content.trim();
  if (content) bits.push(content);
  for (const part of partsOf(row.metadata)) {
    if (part.type === 'quick_picks') bits.push(quickPickSummary(part));
    if (part.type === 'proposal') bits.push(proposalSummary(part.proposal));
  }
  return bits.join(' ').replace(/\s+/g, ' ').trim();
}

function partsOf(metadata: unknown): Array<Record<string, unknown> & { type?: string; proposal?: Record<string, unknown> }> {
  if (!metadata || typeof metadata !== 'object') return [];
  const parts = (metadata as { parts?: unknown }).parts;
  if (!Array.isArray(parts)) return [];
  return parts.filter((part): part is Record<string, unknown> & { type?: string } => !!part && typeof part === 'object');
}

function quickPickSummary(part: Record<string, unknown>): string {
  const options = Array.isArray(part.options) ? part.options : [];
  const labels = options.flatMap((option) => {
    if (!option || typeof option !== 'object') return [];
    const record = option as { id?: unknown; label?: unknown };
    if (typeof record.label !== 'string' || typeof record.id !== 'string') return [];
    return [`${record.label} (${record.id})`];
  });
  const field = typeof part.field === 'string' ? part.field : 'choice';
  return labels.length ? `Quick pick ${field}: ${labels.join(', ')}` : '';
}

function proposalSummary(proposal: Record<string, unknown> | undefined): string {
  if (!proposal || typeof proposal.id !== 'string') return '';
  const lines = Array.isArray(proposal.lines) ? proposal.lines.flatMap((line) => {
    if (!line || typeof line !== 'object') return [];
    const record = line as { description?: unknown; quantity?: unknown; rate?: unknown };
    const description = typeof record.description === 'string' ? record.description : 'Item';
    const quantity = typeof record.quantity === 'string' ? record.quantity : '';
    const rate = typeof record.rate === 'string' ? record.rate : 'missing';
    return [`${description} qty ${quantity} rate ${rate}`];
  }) : [];
  const missing = Array.isArray(proposal.missing) ? proposal.missing.filter((item) => typeof item === 'string') : [];
  const customer = typeof proposal.customerName === 'string'
    ? proposal.customerName
    : typeof proposal.customerId === 'string' ? proposal.customerId : 'unset';
  return [
    `Pending proposal ${proposal.id}`,
    `status ${typeof proposal.status === 'string' ? proposal.status : 'needs_input'}`,
    `customer ${customer}`,
    `due ${typeof proposal.dueDate === 'string' ? proposal.dueDate : 'unset'}`,
    `taxInclusive ${proposal.taxInclusive === true || proposal.taxInclusive === false ? String(proposal.taxInclusive) : 'unset'}`,
    lines.length ? `lines ${lines.join('; ')}` : '',
    missing.length ? `missing ${missing.join(',')}` : '',
  ].filter(Boolean).join('. ');
}
