import { assertAccountingDateOpen } from '../accounting/period-lock';
import { assertGstSourceOpen, invoiceSettlementDates } from '../tax/gst-period-lock';
import { creditNoteSchema, type CreateCreditNoteRequest, type CreditNoteDto, type InvoiceDto, type ReverseCreditNoteRequest } from '@ledgercraft/contracts';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import { withOrganisationTx } from '../auth/bind-organisation';
import { postBalancedEntry, reversePosting, systemAccount } from '../accounting/posting';
import { assertOpenSettlementPeriod } from '../currency/settlement.service';
import { currencyRepository } from '../currency/currency.service';
import { decimal, roundMoney } from '../invoices/money';
import { withSalesTaxCodes } from '../invoices/sales-tax-code';
import { computeInvoiceTotals } from '../invoices/totals';
import * as invoicesRepo from '../invoices/invoices.repository';
import { assertReplayMatches, getIdempotencyRecord, insertIdempotencyRecord, type IdempotencyScope } from '../invoices/idempotency';
import * as repo from './credit-notes.repository';

export type CreditContext = { organisationId: string; userId: string };
export function required<T>(value: T | undefined, name: string): T { if (value === undefined) throw new HTTPException(404, { message: `${name} not found` }); return value; }
const positive = (value: ReturnType<typeof decimal>) => value.compare(0) > 0 ? value : decimal(0);

export async function listCreditNotesForUser(db: Database, userId: string, invoiceId?: string) {
  return withOrganisationTx(db, userId, async (tx, ctx) => ({ creditNotes: await repo.list(tx, ctx.organisationId, invoiceId) }));
}
export async function creditNoteForUser(db: Database, userId: string, id: string) {
  return withOrganisationTx(db, userId, async (tx, ctx) => required(await repo.note(tx, ctx.organisationId, id), 'Credit note'));
}
export async function updateInvoiceCreditSummary(tx: Database, ctx: CreditContext, invoice: InvoiceDto, change: { total: string; tax: string; baseTotal: string; baseTax: string }, reverse = false) {
  const sign = reverse ? '-1' : '1';
  const totalCredited = decimal(invoice.totalCredited ?? '0').add(decimal(change.total).mul(sign));
  const taxCredited = decimal(invoice.taxCredited ?? '0').add(decimal(change.tax).mul(sign));
  const baseCredited = decimal(invoice.baseCredited ?? '0').add(decimal(change.baseTotal).mul(sign));
  const baseTaxCredited = decimal(invoice.baseTaxCredited ?? '0').add(decimal(change.baseTax).mul(sign));
  const balance = positive(decimal(invoice.total).sub(totalCredited).sub(invoice.totalPaid));
  const settled = balance.compare(0) === 0;
  await repo.updateInvoiceCredits(tx, ctx.organisationId, invoice.id, { totalCredited: roundMoney(totalCredited), taxCredited: roundMoney(taxCredited), baseCredited: roundMoney(baseCredited), baseTaxCredited: roundMoney(baseTaxCredited), balanceDue: roundMoney(balance), paymentStatus: settled ? 'paid' : decimal(invoice.totalPaid).compare(0) > 0 || totalCredited.compare(0) > 0 ? 'partially_paid' : 'unpaid', status: settled ? 'paid' : invoice.status === 'paid' ? 'sent' : invoice.status });
}
export async function issueCreditNoteForUser(db: Database, userId: string, input: CreateCreditNoteRequest, scope: IdempotencyScope): Promise<CreditNoteDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const replay = await getIdempotencyRecord(tx, ctx, scope);
    if (replay) { assertReplayMatches(replay.requestHash, scope.requestHash); return creditNoteSchema.parse(replay.responseBody); }
    const invoice = required(await invoicesRepo.getInvoice(tx, ctx.organisationId, input.invoiceId), 'Invoice');
    await assertAccountingDateOpen(tx, ctx.organisationId, input.issueDate);
    await assertGstSourceOpen(tx, ctx.organisationId, [{ kind: 'credit_note', dates: [input.issueDate] }]);
    if (['draft', 'cancelled'].includes(invoice.status)) throw new HTTPException(409, { message: 'Issue a credit note only against an active posted invoice' });
    if (input.issueDate < invoice.date) throw new HTTPException(400, { message: 'Credit note date cannot precede the invoice date' });
    if (invoice.currency !== invoice.baseCurrency) await assertOpenSettlementPeriod(tx, ctx.organisationId, 'invoice', invoice.id, input.issueDate);
    const original = await repo.sourcePosting(tx, ctx.organisationId, invoice.id);
    if (!original || decimal(original.totalAmount).compare(invoice.baseTotal) !== 0) throw new HTTPException(409, { message: 'Audit the source invoice posting before issuing a credit note' });
    if (invoice.baseCurrency !== 'NZD') throw new HTTPException(422, { message: 'Credit notes require NZD base books; the document can use a reviewed foreign currency' });
    const currency = required(await currencyRepository.getCurrency(tx, ctx.organisationId, invoice.currency), 'Document currency');
    if (decimal(input.taxRate).compare(100) > 0 || input.items.some(item => decimal(item.quantity).compare(0) <= 0 || decimal(item.rate).compare(0) < 0)) throw new HTTPException(400, { message: 'Credit quantities must be positive and GST rates between 0 and 100' });
    const totals = withSalesTaxCodes(computeInvoiceTotals(input, input.taxRate, currency.precision), input.items);
    const gross = decimal(totals.total); const tax = decimal(totals.taxAmount); const net = gross.sub(tax);
    if (gross.compare(0) <= 0 || net.compare(0) < 0) throw new HTTPException(400, { message: 'Credit note total must be positive' });
    const priorGross = decimal(invoice.totalCredited ?? '0'); const priorTax = decimal(invoice.taxCredited ?? '0');
    if (gross.compare(decimal(invoice.total).sub(priorGross)) > 0 || tax.compare(decimal(invoice.taxAmount).sub(priorTax)) > 0 || net.compare(decimal(invoice.total).sub(invoice.taxAmount).sub(priorGross.sub(priorTax))) > 0) throw new HTTPException(400, { message: 'Credit note exceeds the remaining invoice total, net amount or GST' });
    // Proportional credit support keeps payments-basis GST deterministic. A
    // non-proportional mixed-tax credit needs an accountant-reviewed workflow.
    const proportionalTax = decimal(roundMoney(decimal(invoice.taxAmount).mul(gross).div(invoice.total)));
    if (tax.sub(proportionalTax).abs().compare('0.01') > 0) throw new HTTPException(400, { message: 'Non-proportional or mixed-tax credits require accountant review; use a proportional credit and a documented GST adjustment where appropriate' });
    const paid = await repo.paidBookAmounts(tx, ctx.organisationId, invoice.id);
    if (paid.some(payment => payment.date > input.issueDate)) throw new HTTPException(400, { message: 'Credit note date must not precede an already recorded invoice payment' });
    if (invoice.currency !== invoice.baseCurrency && paid.some(payment => payment.bookBaseAmount === null)) throw new HTTPException(409, { message: 'Audit historical foreign settlements before issuing a credit note' });
    const earlier = (await repo.list(tx, ctx.organisationId, invoice.id)).filter(note => note.status === 'issued');
    if (earlier.some(note => note.issueDate > input.issueDate)) throw new HTTPException(400, { message: 'Credit note date must not precede an already issued credit note' });
    const bookPaid = paid.reduce((sum, payment) => sum.add(payment.bookBaseAmount ?? payment.amount), decimal(0));
    const arCredited = earlier.reduce((sum, note) => sum.add(note.baseReceivableAmount), decimal(0));
    const baseArAvailable = decimal(invoice.baseTotal).sub(bookPaid).sub(arCredited);
    if (baseArAvailable.compare(0) < 0) throw new HTTPException(409, { message: 'Audit the source receivable carrying balance before issuing a credit note' });
    const ar = gross.compare(invoice.balanceDue) < 0 ? gross : decimal(invoice.balanceDue); const liability = gross.sub(ar);
    let baseGross = decimal(roundMoney(decimal(invoice.baseTotal).mul(priorGross.add(gross)).div(invoice.total))).sub(invoice.baseCredited ?? '0');
    let baseAr = liability.compare(0) === 0 ? baseGross : decimal(roundMoney(baseGross.mul(ar).div(gross)));
    if (ar.compare(invoice.balanceDue) === 0 && ar.compare(0) > 0) {
      baseAr = baseArAvailable;
      if (liability.compare(0) === 0) baseGross = baseAr;
      if (baseAr.compare(baseGross) > 0) baseAr = baseGross;
    }
    const baseTax = tax.compare(0) === 0 || decimal(invoice.taxAmount).compare(0) === 0 ? decimal(0) : decimal(roundMoney(decimal(invoice.baseTaxAmount).mul(priorTax.add(tax)).div(invoice.taxAmount))).sub(invoice.baseTaxCredited ?? '0');
    const baseLiability = baseGross.sub(baseAr);
    if (baseGross.compare(0) <= 0 || baseTax.compare(0) < 0 || baseTax.compare(baseGross) > 0 || baseLiability.compare(0) < 0) throw new HTTPException(422, { message: 'Credit is below base-currency precision or has an invalid carrying allocation; review the remaining cents' });
    const id = crypto.randomUUID(); const creditNoteNumber = `CN-${input.issueDate.slice(0, 4)}-${id.slice(0, 8).toUpperCase()}`;
    const baseLiabilityTax = liability.compare(0) === 0 ? '0.00' : roundMoney(baseTax.mul(liability).div(gross));
    await repo.insert(tx, { id, organisationId: ctx.organisationId, userId: ctx.userId, invoiceId: invoice.id, customerId: invoice.customerId, creditNoteNumber, issueDate: input.issueDate, reason: input.reason, currency: invoice.currency, exchangeRate: invoice.exchangeRate, exchangeRateId: invoice.exchangeRateId, baseCurrency: invoice.baseCurrency, subtotal: totals.subtotal, taxAmount: totals.taxAmount, total: totals.total, baseTotal: roundMoney(baseGross), baseTaxAmount: roundMoney(baseTax), receivableAmount: roundMoney(ar), baseReceivableAmount: roundMoney(baseAr), customerCreditAmount: roundMoney(liability), baseCustomerCreditAmount: roundMoney(baseLiability), baseCustomerCreditTaxAmount: baseLiabilityTax }, totals.lines.map(line => ({ ...line, id: crypto.randomUUID() })));
    const lines = [{ accountId: await repo.revenueAccount(tx, ctx.organisationId), description: input.reason, debit: roundMoney(baseGross.sub(baseTax)), credit: '0.00' }];
    if (baseTax.compare(0) > 0) lines.push({ accountId: await systemAccount(tx, ctx, '2200'), description: input.reason, debit: roundMoney(baseTax), credit: '0.00' });
    if (baseAr.compare(0) > 0) lines.push({ accountId: await systemAccount(tx, ctx, '1200'), description: input.reason, debit: '0.00', credit: roundMoney(baseAr) });
    if (baseLiability.compare(0) > 0) lines.push({ accountId: await repo.customerCreditAccount(tx, ctx), description: input.reason, debit: '0.00', credit: roundMoney(baseLiability) });
    await postBalancedEntry(tx, ctx, { date: input.issueDate, description: `${creditNoteNumber}: ${input.reason}`, referenceType: 'credit_note', referenceId: id, lines });
    await updateInvoiceCreditSummary(tx, ctx, invoice, { total: totals.total, tax: totals.taxAmount, baseTotal: roundMoney(baseGross), baseTax: roundMoney(baseTax) });
    await invoicesRepo.recordHistory(tx, ctx, invoice.id, { action: 'updated', metadata: { creditNoteId: id, creditNoteNumber, total: totals.total } });
    const result = required(await repo.note(tx, ctx.organisationId, id), 'Credit note');
    await insertIdempotencyRecord(tx, ctx, scope, { status: 201, body: result }); return result;
  });
}
export async function reverseCreditNoteForUser(db: Database, userId: string, id: string, input: ReverseCreditNoteRequest) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const credit = required(await repo.note(tx, ctx.organisationId, id), 'Credit note');
    if (credit.status === 'reversed') {
      if (credit.reversalDate !== input.date || credit.reversalReason !== input.reason) throw new HTTPException(409, { message: 'Credit note was already reversed with different details' });
      return credit;
    }
    await assertAccountingDateOpen(tx, ctx.organisationId, credit.issueDate, input.date);
    await assertGstSourceOpen(tx, ctx.organisationId, [
      { kind: 'credit_note', dates: [credit.issueDate, input.date] },
      { kind: 'customer_settlement', dates: [input.date], cumulativeWith: await invoiceSettlementDates(tx, ctx.organisationId, credit.invoiceId) },
    ]);
    if (input.date < credit.issueDate || credit.refunds.some(refund => (refund.reversalDate ?? refund.refundDate) > input.date)) throw new HTTPException(400, { message: 'Reversal date must follow the credit note and its refund reversals' });
    if (credit.refunds.some(refund => refund.status === 'completed')) throw new HTTPException(409, { message: 'Reverse customer refunds before reversing the credit note' });
    const invoice = required(await invoicesRepo.getInvoice(tx, ctx.organisationId, credit.invoiceId), 'Invoice');
    if (invoice.currency !== invoice.baseCurrency) await assertOpenSettlementPeriod(tx, ctx.organisationId, 'invoice', invoice.id, input.date);
    await reversePosting(tx, ctx, { referenceType: 'credit_note', referenceId: credit.id, reversalType: 'credit_note_reversal', date: input.date, description: `Reverse ${credit.creditNoteNumber}: ${input.reason}` });
    await repo.update(tx, ctx.organisationId, id, { status: 'reversed', reversalDate: input.date, reversalReason: input.reason });
    await updateInvoiceCreditSummary(tx, ctx, invoice, { total: credit.total, tax: credit.taxAmount, baseTotal: credit.baseTotal, baseTax: credit.baseTaxAmount }, true);
    await invoicesRepo.recordHistory(tx, ctx, invoice.id, { action: 'updated', metadata: { creditNoteId: id, event: 'credit_note_reversed', reason: input.reason } });
    return required(await repo.note(tx, ctx.organisationId, id), 'Credit note');
  });
}
