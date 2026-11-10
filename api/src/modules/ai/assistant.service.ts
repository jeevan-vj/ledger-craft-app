import {
  invoiceSchema,
  previewAssistantProposalResponseSchema,
  type AssistantTurnRequest,
  type AssistantTurnResponse,
  type CreateInvoiceRequest,
  type PreviewAssistantProposalRequest,
  type PreviewAssistantProposalResponse,
  type SaveAssistantDraftRequest,
} from '@ledgercraft/contracts';
import type { Database } from '../../db/client';
import { apiError } from '../../http-error';
import { withOrganisationTx } from '../auth/bind-organisation';
import type { AppCapabilities } from '../../types';
import { getIdempotencyRecord, insertIdempotencyRecord, assertReplayMatches, type IdempotencyScope } from '../invoices/idempotency';
import { createInvoiceInTx } from '../invoices/invoices.service';
import { computeInvoiceTotals } from '../invoices/totals';
import { getInvoice } from '../invoices/invoices.repository';
import { getCustomer } from '../customers/customers.repository';
import { getItem } from '../items/items.repository';
import { getBusinessProfile } from '../business-profile/business-profile.repository';
import { decimal } from '../invoices/money';
import { resolveDocumentCurrency } from '../currency/currency.service';
import { ASSISTANT_DEFAULTS, assistantEnabled, resolveLimits, tokenCostUsd, type AssistantRuntime } from './assistant.config';
import { runAssistantLoop } from './assistant.loop';
import { consumeAssistantPreview } from './assistant.preview-limit';
import {
  ensureAssistantConversation,
  findProposal,
  insertAssistantEvent,
  markProposalSaved,
  purgeAssistantRetention,
  storeAssistantTurn,
  updateAssistantEvent,
  usageSince,
  type AssistantOutcome,
} from './assistant.store';
import type { AssistantProposal } from '@ledgercraft/contracts';

const DISABLED = 'The assistant is turned off. Use Invoices to continue.';
const UNAVAILABLE = 'The assistant is not configured.';
const LIMITED = 'Assistant limit reached for this business. Use Invoices to continue.';
const INCOMPLETE = 'Add the missing invoice details before saving.';
const MISSING = 'That proposal is not in this business.';
const DUE_BEFORE = "Due date can't be before the invoice date";

function assertEnabled(capabilities?: AppCapabilities) {
  if (!assistantEnabled(capabilities?.assistant)) throw apiError(403, 'ASSISTANT_DISABLED', DISABLED);
}

type DraftSourceLine = {
  description: string;
  quantity: string;
  rate: string | null;
  unit?: string | null;
  itemId?: string | null;
  taxRate?: string;
};

type FieldError = { field: string; message: string };

type PricedDraft = {
  date: string;
  dueDate: string | null;
  taxInclusive: boolean | null;
  taxRate: string;
  lines: PreviewAssistantProposalResponse['lines'];
  subtotal: string | null;
  taxAmount: string | null;
  total: string | null;
  errors: FieldError[];
  request: CreateInvoiceRequest | null;
};

async function priceAssistantDraft(
  tx: Database,
  organisationId: string,
  proposal: AssistantProposal,
  edits: SaveAssistantDraftRequest['edits'],
): Promise<PricedDraft> {
  const issueDate = edits?.issueDate ?? proposal.date;
  const dueDate = edits?.dueDate ?? proposal.dueDate;
  const taxInclusive = edits?.taxInclusive ?? proposal.taxInclusive;
  const taxRate = edits?.taxRate ?? proposal.taxRate;
  const errors: FieldError[] = [];
  const customerId = edits?.customerId ?? proposal.customerId;
  const customer = customerId ? await getCustomer(tx, organisationId, customerId) : undefined;
  if (!customer) errors.push({ field: 'customerId', message: 'Choose a customer in this business.' });
  if (!dueDate) errors.push({ field: 'dueDate', message: 'Enter a due date' });
  else if (dueDate < issueDate) errors.push({ field: 'dueDate', message: DUE_BEFORE });
  if (taxInclusive == null) errors.push({ field: 'taxInclusive', message: 'Choose whether the price includes GST' });

  const source: DraftSourceLine[] = edits?.lines
    ? edits.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      rate: line.rate,
      unit: line.unit,
      itemId: line.itemId,
      taxRate: line.taxRate,
    }))
    : proposal.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      rate: line.rate,
      unit: line.unit,
      itemId: line.itemId,
    }));

  const lines: PricedDraft['lines'] = [];
  for (const [index, line] of source.entries()) {
    if (line.itemId && !await getItem(tx, organisationId, line.itemId)) {
      errors.push({ field: `lines.${index}.itemId`, message: 'That item is not in this business.' });
    }
    if (!line.rate) errors.push({ field: `lines.${index}.rate`, message: 'Enter a price' });
    lines.push({
      description: line.description,
      quantity: line.quantity,
      rate: line.rate,
      taxRate: line.taxRate ?? taxRate,
      tax: null,
      total: null,
    });
  }

  const blocking = errors.filter((error) => error.message !== DUE_BEFORE);
  let request: CreateInvoiceRequest | null = null;
  let subtotal: string | null = null;
  let taxAmount: string | null = null;
  let total: string | null = null;
  if (blocking.length === 0 && customer && dueDate && taxInclusive != null) {
    const notes = edits && 'notes' in edits ? (edits.notes ?? null) : proposal.notes;
    request = {
      customerId: customer.id,
      date: issueDate,
      dueDate,
      notes,
      taxInclusive,
      taxRate,
      currency: proposal.currency,
      status: 'draft',
      items: source.map((line) => ({
        description: line.description,
        quantity: line.quantity,
        rate: line.rate ?? '',
        ...(line.unit ? { unit: line.unit } : {}),
        ...(line.taxRate !== undefined ? { taxes: [{ id: 'gst', name: 'GST', rate: line.taxRate }] } : {}),
      })),
    };
    const profile = await getBusinessProfile(tx, organisationId);
    const resolved = await resolveDocumentCurrency(tx, organisationId, request.currency, request.date);
    const totals = computeInvoiceTotals(request, profile?.defaultTaxRate ?? '0', resolved.currency.precision);
    subtotal = totals.subtotal;
    taxAmount = totals.taxAmount;
    total = totals.total;
    totals.lines.forEach((line, index) => {
      lines[index] = {
        description: line.description,
        quantity: line.quantity,
        rate: line.rate,
        taxRate: line.taxes[0]?.rate ?? '0',
        tax: line.tax,
        total: line.total,
      };
    });
  }

  return { date: issueDate, dueDate, taxInclusive, taxRate, lines, subtotal, taxAmount, total, errors, request };
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
    const reservedCost = decimal(limits.callReserveUsd).toFixed(6);
    if (usage.day >= limits.dailyMessages || usage.minute >= limits.perMinute || usage.cost.add(reservedCost).compare(limits.dailyCostUsd) > 0) {
      await insertAssistantEvent(tx, { organisationId: ctx.organisationId, userId, requestId, action: 'turn', outcome: 'limit' });
      return { blocked: true as const };
    }
    const conversationId = await ensureAssistantConversation(tx, ctx, input.conversationId);
    if (!conversationId) return { blocked: false as const, missing: true as const };
    const eventId = await insertAssistantEvent(tx, { organisationId: ctx.organisationId, userId, requestId, action: 'turn', outcome: 'reply', costUsd: reservedCost });
    return { blocked: false as const, missing: false as const, organisationId: ctx.organisationId, conversationId, eventId, reservedCost };
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
      maxSteps: Math.min(runtime.maxSteps ?? ASSISTANT_DEFAULTS.maxSteps, ASSISTANT_DEFAULTS.maxSteps),
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
        proposal: loop.outcome === 'proposal' ? loop.proposal : undefined,
      });
      return { conversationId: gate.conversationId, parts: loop.parts };
    });
    return response;
  } catch (error) {
    const outcome = failureOutcome(error);
    if (outcome) {
      await withOrganisationTx(db, userId, (tx, ctx) => updateAssistantEvent(tx, ctx.organisationId, gate.eventId, {
        outcome, toolNames: [], inputTokens: 0, outputTokens: 0, costUsd: gate.reservedCost,
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

export async function saveAssistantDraftForUser(
  db: Database,
  userId: string,
  input: SaveAssistantDraftRequest,
  capabilities: AppCapabilities | undefined,
  idempotency: IdempotencyScope | undefined,
  requestId: string,
) {
  assertEnabled(capabilities);
  const outcome = await withOrganisationTx(db, userId, async (tx, ctx) => {
    if (idempotency) {
      const existing = await getIdempotencyRecord(tx, ctx, idempotency);
      if (existing) {
        assertReplayMatches(existing.requestHash, idempotency.requestHash);
        return { kind: 'invoice' as const, invoice: invoiceSchema.parse(existing.responseBody) };
      }
    }
    const stored = await findProposal(tx, ctx.organisationId, input.proposalId, input.conversationId);
    if (!stored) return { kind: 'missing' as const };
    if (stored.savedInvoiceId) {
      const invoice = await getInvoice(tx, ctx.organisationId, stored.savedInvoiceId);
      if (!invoice) return { kind: 'missing' as const };
      if (idempotency) await insertIdempotencyRecord(tx, ctx, idempotency, { status: 201, body: invoice });
      return { kind: 'invoice' as const, invoice };
    }
    if (!stored.proposal) return { kind: 'missing' as const };
    const priced = await priceAssistantDraft(tx, ctx.organisationId, stored.proposal, input.edits);
    if (!priced.request) {
      await insertAssistantEvent(tx, { organisationId: ctx.organisationId, userId, requestId, action: 'save_draft', outcome: 'incomplete', confirmed: false });
      return { kind: 'incomplete' as const };
    }
    if (priced.errors.length > 0) return { kind: 'invalid' as const, message: priced.errors[0]?.message ?? DUE_BEFORE };
    const invoice = await createInvoiceInTx(tx, ctx, priced.request);
    await markProposalSaved(tx, ctx.organisationId, stored.proposal.id, invoice.id);
    await insertAssistantEvent(tx, {
      organisationId: ctx.organisationId, userId, requestId, action: 'save_draft', outcome: 'saved',
      confirmed: true, draftId: invoice.id, toolNames: ['save_draft'],
    });
    if (idempotency) await insertIdempotencyRecord(tx, ctx, idempotency, { status: 201, body: invoice });
    return { kind: 'invoice' as const, invoice };
  });
  if (outcome.kind === 'missing') throw apiError(404, 'NOT_FOUND', MISSING);
  if (outcome.kind === 'incomplete') throw apiError(422, 'PROPOSAL_INCOMPLETE', INCOMPLETE);
  if (outcome.kind === 'invalid') throw apiError(400, 'VALIDATION_ERROR', outcome.message);
  return outcome.invoice;
}

export async function previewAssistantProposalForUser(
  db: Database,
  userId: string,
  proposalId: string,
  input: PreviewAssistantProposalRequest,
  capabilities: AppCapabilities | undefined,
  previewPerMinute: number,
): Promise<PreviewAssistantProposalResponse> {
  assertEnabled(capabilities);
  const outcome = await withOrganisationTx(db, userId, async (tx, ctx) => {
    consumeAssistantPreview(ctx.organisationId, previewPerMinute);
    const stored = await findProposal(tx, ctx.organisationId, proposalId, input.conversationId);
    if (!stored?.proposal) return { kind: 'missing' as const };
    const priced = await priceAssistantDraft(tx, ctx.organisationId, stored.proposal, input.edits);
    return {
      kind: 'preview' as const,
      body: previewAssistantProposalResponseSchema.parse({
        proposalId: stored.proposal.id,
        date: priced.date,
        dueDate: priced.dueDate,
        taxInclusive: priced.taxInclusive,
        taxRate: priced.taxRate,
        lines: priced.lines,
        subtotal: priced.subtotal,
        taxAmount: priced.taxAmount,
        total: priced.total,
        errors: priced.errors,
      }),
    };
  });
  if (outcome.kind === 'missing') throw apiError(404, 'NOT_FOUND', MISSING);
  return outcome.body;
}
