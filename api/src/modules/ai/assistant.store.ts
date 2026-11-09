import { assistantProposalSchema, type AssistantPart, type AssistantProposal } from '@ledgercraft/contracts';
import { and, eq, gte, inArray, lt } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { assistantEvents } from '../../db/schema/assistant-events';
import { conversationMessages, conversations } from '../../db/schema/conversations';
import { decimal } from '../invoices/money';
import { insertConversation, insertMessage } from '../conversations/conversations.repository';
import { proposalSignatureMatches, signProposal } from './assistant.proposal';

export type AssistantOutcome = 'reply' | 'proposal' | 'refused' | 'limit' | 'timeout' | 'invalid_output' | 'saved' | 'incomplete';

type UsageMetadata = {
  kind: 'assistant_proposal' | 'assistant_reply';
  proposal?: AssistantProposal;
  signature?: string;
  savedInvoiceId?: string;
  parts?: AssistantPart[];
};

export function publicToolNames(names: string[]): string {
  const clean = names.slice(0, 8).map((name) => name.replace(/[^a-z0-9_]/gi, '').slice(0, 64)).filter(Boolean);
  return JSON.stringify(clean);
}

export async function purgeAssistantRetention(tx: Database, organisationId: string, now: Date, retentionDays: number) {
  const cutoff = new Date(now.getTime() - retentionDays * 86_400_000);
  await tx.delete(assistantEvents).where(and(
    eq(assistantEvents.organisationId, organisationId),
    lt(assistantEvents.createdAt, cutoff),
  ));
  const rows = await tx.select({ id: conversations.id, context: conversations.context })
    .from(conversations)
    .where(eq(conversations.organisationId, organisationId));
  const assistantIds = rows
    .filter((row) => (row.context as { kind?: string } | null)?.kind === 'assistant')
    .map((row) => row.id);
  if (!assistantIds.length) return;
  await tx.delete(conversationMessages).where(and(
    eq(conversationMessages.organisationId, organisationId),
    inArray(conversationMessages.conversationId, assistantIds),
    lt(conversationMessages.createdAt, cutoff),
  ));
}

export async function usageSince(tx: Database, organisationId: string, now: Date) {
  const dayStart = new Date(now.getTime() - 86_400_000);
  const minuteStart = new Date(now.getTime() - 60_000);
  const rows = await tx.select({
    createdAt: assistantEvents.createdAt,
    costUsd: assistantEvents.costUsd,
  }).from(assistantEvents).where(and(
    eq(assistantEvents.organisationId, organisationId),
    eq(assistantEvents.action, 'turn'),
    gte(assistantEvents.createdAt, dayStart),
  ));
  let day = 0;
  let minute = 0;
  let cost = decimal(0);
  for (const row of rows) {
    day += 1;
    cost = cost.add(row.costUsd);
    if (row.createdAt >= minuteStart) minute += 1;
  }
  return { day, minute, cost };
}

export async function insertAssistantEvent(tx: Database, input: {
  organisationId: string;
  userId: string;
  requestId: string;
  action: 'turn' | 'save_draft';
  outcome: AssistantOutcome;
  toolNames?: string[];
  confirmed?: boolean;
  draftId?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: string;
}) {
  const [row] = await tx.insert(assistantEvents).values({
    organisationId: input.organisationId,
    actorUserId: input.userId,
    requestId: input.requestId.slice(0, 80),
    action: input.action,
    outcome: input.outcome,
    toolNames: publicToolNames(input.toolNames ?? []),
    confirmed: input.confirmed ?? false,
    draftId: input.draftId ?? null,
    inputTokens: input.inputTokens ?? 0,
    outputTokens: input.outputTokens ?? 0,
    costUsd: input.costUsd ?? '0.000000',
  }).returning({ id: assistantEvents.id });
  return row.id;
}

export async function updateAssistantEvent(tx: Database, organisationId: string, id: string, patch: {
  outcome: AssistantOutcome;
  toolNames: string[];
  inputTokens: number;
  outputTokens: number;
  costUsd: string;
}) {
  await tx.update(assistantEvents).set({
    outcome: patch.outcome,
    toolNames: publicToolNames(patch.toolNames),
    inputTokens: patch.inputTokens,
    outputTokens: patch.outputTokens,
    costUsd: patch.costUsd,
  }).where(and(eq(assistantEvents.id, id), eq(assistantEvents.organisationId, organisationId)));
}

export async function ensureAssistantConversation(tx: Database, ctx: { organisationId: string; userId: string }, conversationId?: string) {
  if (!conversationId) {
    const created = await insertConversation(tx, ctx, { title: 'Assistant', context: { kind: 'assistant' } });
    return created.id;
  }
  const [row] = await tx.select().from(conversations).where(and(
    eq(conversations.id, conversationId),
    eq(conversations.organisationId, ctx.organisationId),
  ));
  if (!row || (row.context as { kind?: string } | null)?.kind !== 'assistant') {
    return undefined;
  }
  return row.id;
}

export async function storeAssistantTurn(tx: Database, ctx: { organisationId: string; userId: string }, input: {
  conversationId: string;
  prompt: string;
  parts: AssistantPart[];
  proposal?: AssistantProposal;
}) {
  await insertMessage(tx, ctx, input.conversationId, { role: 'user', content: input.prompt });
  const reply = input.parts.filter((part) => part.type === 'text').map((part) => part.text).join(' ').slice(0, 1_000) || 'Assistant reply';
  const metadata: UsageMetadata = input.proposal
    ? { kind: 'assistant_proposal', proposal: input.proposal, signature: signProposal(ctx.organisationId, input.proposal), parts: input.parts }
    : { kind: 'assistant_reply', parts: input.parts };
  await insertMessage(tx, ctx, input.conversationId, { role: 'assistant', content: reply, metadata });
}

export async function findProposal(tx: Database, organisationId: string, proposalId: string, conversationId: string) {
  const rows = await tx.select({
    id: conversationMessages.id,
    conversationId: conversationMessages.conversationId,
    metadata: conversationMessages.metadata,
  }).from(conversationMessages).where(and(
    eq(conversationMessages.organisationId, organisationId),
    eq(conversationMessages.conversationId, conversationId),
  ));
  for (const row of rows) {
    const metadata = row.metadata as UsageMetadata | null;
    if (metadata?.kind !== 'assistant_proposal' || metadata.proposal?.id !== proposalId || !metadata.signature) continue;
    const parsed = assistantProposalSchema.safeParse(metadata.proposal);
    if (!parsed.success || !proposalSignatureMatches(organisationId, parsed.data, metadata.signature)) return undefined;
    return { messageId: row.id, proposal: parsed.data, savedInvoiceId: metadata.savedInvoiceId, metadata };
  }
  return undefined;
}

export async function markProposalSaved(tx: Database, organisationId: string, messageId: string, metadata: UsageMetadata, invoiceId: string) {
  await tx.update(conversationMessages).set({
    metadata: { ...metadata, savedInvoiceId: invoiceId },
  }).where(and(eq(conversationMessages.id, messageId), eq(conversationMessages.organisationId, organisationId)));
}
