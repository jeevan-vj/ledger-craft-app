import { HTTPException } from 'hono/http-exception';
import { fxRevaluationResponseSchema, type FxRevaluationPreviewRequest, type FxRevaluationRequest, type FxRevaluationResponse } from '@ledgercraft/contracts';
import type { Database } from '../../db/client';
import { withOrganisationTx, type OrganisationContext } from '../auth/bind-organisation';
import { decimal, roundMoney } from '../invoices/money';
import { assertReplayMatches, hashIdempotencyPayload, insertIdempotencyRecord } from '../invoices/idempotency';
import { postBalancedEntry, systemAccount } from '../accounting/posting';
import { organisationToday } from '../accounting/organisation-date';
import { currencyRepository, convertToBase } from './currency.service';
import * as repo from './revaluation.repository';

const nextDay = (date: string) => new Date(new Date(`${date}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
const reversals = new Set(['invoice_cancellation', 'bill_void']);

async function prepare(tx: Database, organisationId: string, input: FxRevaluationPreviewRequest): Promise<FxRevaluationResponse> {
  if (input.asOfDate > await organisationToday(tx, organisationId)) throw new HTTPException(422, { message: 'The valuation date must not be in the future' });
  const localization = await currencyRepository.getLocalization(tx, organisationId);
  if (localization.baseCurrency !== 'NZD') throw new HTTPException(422, { message: 'Financial revaluation currently requires an NZD company base currency' });
  const rates = await Promise.all(input.exchangeRateIds.map(id => currencyRepository.getRateById(tx, organisationId, id)));
  if (rates.some(rate => !rate || rate.baseCurrency !== 'NZD' || rate.effectiveDate > input.asOfDate)) throw new HTTPException(422, { message: 'Choose reviewed company rates dated on or before the valuation date' });
  const selected = new Map(rates.map(rate => [rate!.currencyCode, rate!]));
  if (selected.size !== rates.length) throw new HTTPException(422, { message: 'Choose one reviewed rate for each foreign currency' });
  const [documents, movements, settlements, credits] = await Promise.all([
    repo.foreignDocuments(tx, organisationId, input.asOfDate), repo.sourceMovements(tx, organisationId, input.asOfDate),
    repo.settlementsAsOf(tx, organisationId, input.asOfDate), repo.creditsAsOf(tx, organisationId, input.asOfDate),
  ]);
  const positions: FxRevaluationResponse['positions'] = [];
  let gains = decimal(0); let losses = decimal(0);
  for (const document of documents) {
    const entries = movements.filter(row => row.documentId === document.id);
    const original = entries.find(row => row.type === document.type);
    if (!original) continue; // Unposted drafts are not foreign monetary positions.
    const active = entries.reduce((sum, row) => reversals.has(row.type!) ? sum.sub(row.total) : sum.add(row.total), decimal(0));
    if (active.compare(0) === 0) continue;
    if (document.baseCurrency !== 'NZD' || decimal(original.total).compare(document.baseTotal) !== 0 || active.compare(document.baseTotal) !== 0) throw new HTTPException(409, { message: `Audit the historical foreign journal for ${document.number} before revaluation` });
    const cash = settlements.filter(row => row.documentId === document.id);
    if (cash.some(row => row.bookBaseAmount === null)) throw new HTTPException(409, { message: `Audit the historical settlement snapshots for ${document.number} before revaluation` });
    const notes = credits.filter(row => row.documentId === document.id);
    const paid = cash.reduce((sum, row) => sum.add(row.amount), decimal(0));
    const credited = notes.reduce((sum, row) => sum.add(row.amount), decimal(0));
    const outstanding = decimal(document.total).sub(paid).sub(credited);
    if (outstanding.compare(0) <= 0) continue;
    const cleared = cash.reduce((sum, row) => sum.add(row.bookBaseAmount!), decimal(0));
    const baseCredits = notes.reduce((sum, row) => sum.add(row.baseAmount), decimal(0));
    const book = decimal(document.baseTotal).sub(cleared).sub(baseCredits);
    if (book.compare(0) < 0) throw new HTTPException(409, { message: `Review the carrying value of ${document.number} before revaluation` });
    const rate = selected.get(document.currency);
    if (!rate) throw new HTTPException(422, { message: `Choose a reviewed ${document.currency} rate for the open ${document.number} position` });
    const revalued = convertToBase(roundMoney(outstanding), rate.rate, 2);
    const diff = decimal(revalued).sub(book);
    const gain = document.type === 'invoice' ? diff.compare(0) > 0 : diff.compare(0) < 0;
    if (gain) gains = gains.add(diff.abs()); else losses = losses.add(diff.abs());
    positions.push({ documentType: document.type, documentId: document.id, documentNumber: document.number, currency: document.currency,
      foreignOutstanding: roundMoney(outstanding), bookBaseAmount: roundMoney(book), revaluedBaseAmount: revalued,
      exchangeDifference: roundMoney(diff), exchangeRateId: rate.id, exchangeRate: rate.rate });
  }
  return fxRevaluationResponseSchema.parse({ asOfDate: input.asOfDate, reversalDate: nextDay(input.asOfDate), baseCurrency: 'NZD', positions,
    unrealizedGain: roundMoney(gains), unrealizedLoss: roundMoney(losses),
    warnings: ['Reviewed book revaluation only. Original document rates and GST are unchanged; each adjustment reverses on the following day.'],
    journalEntryIds: [], reversalJournalEntryIds: [], replayed: false });
}

export async function previewRevaluationForUser(db: Database, userId: string, input: FxRevaluationPreviewRequest) {
  return withOrganisationTx(db, userId, (tx, ctx) => prepare(tx, ctx.organisationId, input));
}

export async function postRevaluationForUser(db: Database, userId: string, input: FxRevaluationRequest) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const scope = { method: 'POST', path: '/api/fx-revaluations', key: `fx-revaluation-${input.asOfDate}`,
      requestHash: hashIdempotencyPayload({ ...input, exchangeRateIds: [...input.exchangeRateIds].sort() }) };
    const stored = await repo.storedRevaluation(tx, ctx.organisationId, scope.key);
    if (stored) { assertReplayMatches(stored.requestHash, scope.requestHash); return fxRevaluationResponseSchema.parse({ ...fxRevaluationResponseSchema.parse(stored.responseBody), replayed: true }); }
    const result = await prepare(tx, ctx.organisationId, input);
    for (const position of result.positions) await postPosition(tx, ctx, input, result, position);
    await insertIdempotencyRecord(tx, ctx, scope, { status: 201, body: result });
    return result;
  });
}

async function postPosition(tx: Database, ctx: OrganisationContext, input: FxRevaluationRequest, result: FxRevaluationResponse, position: FxRevaluationResponse['positions'][number]) {
  const diff = decimal(position.exchangeDifference);
  if (diff.compare(0) === 0) return;
  const gain = position.documentType === 'invoice' ? diff.compare(0) > 0 : diff.compare(0) < 0;
  const gainLoss = await repo.unrealizedAccount(tx, ctx, gain);
  if (!gainLoss) throw new HTTPException(409, { message: 'The unrealized exchange account code has an incompatible classification' });
  const control = await systemAccount(tx, ctx, position.documentType === 'invoice' ? '1200' : '2100');
  const amount = roundMoney(diff.abs());
  const debitControl = (position.documentType === 'invoice') === (diff.compare(0) > 0);
  const referenceId = `${input.asOfDate}:${position.documentType}:${position.documentId}`;
  const lines = [
    { accountId: control, description: `Revalue ${position.documentNumber}`, debit: debitControl ? amount : '0.00', credit: debitControl ? '0.00' : amount },
    { accountId: gainLoss, description: input.reason, debit: gain ? '0.00' : amount, credit: gain ? amount : '0.00' },
  ];
  result.journalEntryIds.push(await postBalancedEntry(tx, ctx, { date: input.asOfDate, description: `Reviewed FX revaluation of ${position.documentNumber}: ${input.reason}`, referenceType: 'fx_revaluation', referenceId, lines }));
  result.reversalJournalEntryIds.push(await postBalancedEntry(tx, ctx, { date: result.reversalDate, description: `Reverse FX revaluation of ${position.documentNumber}`, referenceType: 'fx_revaluation_reversal', referenceId, lines: lines.map(line => ({ ...line, debit: line.credit, credit: line.debit })) }));
}
