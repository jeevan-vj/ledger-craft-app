import { assertAccountingDateOpen } from '../accounting/period-lock';
import { assertGstSourceOpen } from '../tax/gst-period-lock';
import { creditNoteSchema, type CreditNoteDto, type RefundCreditNoteRequest, type ReverseCreditNoteRequest } from '@ledgercraft/contracts';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import { withOrganisationTx } from '../auth/bind-organisation';
import { bankLedgerAccount, postBalancedEntry, reversePosting } from '../accounting/posting';
import { getAccount as bankAccount } from '../bank/bank.repository';
import { convertToBase, currencyRepository, resolveDocumentCurrency } from '../currency/currency.service';
import { assertOpenSettlementPeriod, exchangeDifferenceLine } from '../currency/settlement.service';
import { assertReplayMatches, getIdempotencyRecord, insertIdempotencyRecord, type IdempotencyScope } from '../invoices/idempotency';
import { decimal, roundMoney } from '../invoices/money';
import { required } from './credit-notes.service';
import * as repo from './credit-notes.repository';

export async function refundCreditNoteForUser(db: Database, userId: string, id: string, input: RefundCreditNoteRequest, scope: IdempotencyScope): Promise<CreditNoteDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const replay = await getIdempotencyRecord(tx, ctx, scope);
    if (replay) { assertReplayMatches(replay.requestHash, scope.requestHash); return creditNoteSchema.parse(replay.responseBody); }
    const credit = required(await repo.note(tx, ctx.organisationId, id), 'Credit note');
    await assertAccountingDateOpen(tx, ctx.organisationId, input.refundDate);
    await assertGstSourceOpen(tx, ctx.organisationId, [{ kind: 'customer_settlement', dates: [input.refundDate] }]);
    if (credit.status !== 'issued') throw new HTTPException(409, { message: 'Only an issued credit note can be refunded' });
    if (input.refundDate < credit.issueDate || credit.refunds.some(refund => (refund.reversalDate ?? refund.refundDate) > input.refundDate)) throw new HTTPException(400, { message: 'Refund date must follow the credit note and earlier refund movements' });
    const amount = decimal(input.amount);
    if (amount.compare(0) <= 0 || amount.compare(credit.refundAvailable) > 0) throw new HTTPException(400, { message: 'Refund exceeds the unrefunded customer credit' });
    const bank = required(await bankAccount(tx, ctx.organisationId, input.bankAccountId), 'Bank account');
    if (!bank.isActive || bank.currency !== credit.baseCurrency) throw new HTTPException(422, { message: 'Select an active bank account in the company base currency' });
    if (credit.currency !== credit.baseCurrency) await assertOpenSettlementPeriod(tx, ctx.organisationId, 'invoice', credit.invoiceId, input.refundDate);
    const resolved = await resolveDocumentCurrency(tx, ctx.organisationId, credit.currency, input.refundDate);
    if (resolved.base.code !== credit.baseCurrency) throw new HTTPException(409, { message: 'Company and credit-note base currencies disagree' });
    if (decimal(amount.toFixed(resolved.currency.precision)).compare(amount) !== 0) throw new HTTPException(400, { message: 'Refund amount exceeds the document currency precision' });
    let rate = resolved.rate; let rateId = resolved.rateId;
    if (input.exchangeRateId) {
      const selected = await currencyRepository.getRateById(tx, ctx.organisationId, input.exchangeRateId);
      if (!selected || selected.currencyCode !== credit.currency || selected.baseCurrency !== credit.baseCurrency || selected.effectiveDate > input.refundDate) throw new HTTPException(422, { message: 'Select a reviewed refund-date exchange rate for this company and currency' });
      rate = selected.rate; rateId = selected.id;
    }
    const baseAmount = convertToBase(input.amount, rate, resolved.base.precision);
    const bookBase = decimal(roundMoney(decimal(credit.baseCustomerCreditAmount).mul(decimal(credit.refundedAmount).add(amount)).div(credit.customerCreditAmount))).sub(credit.baseRefundedAmount);
    if (bookBase.compare(0) < 0 || bookBase.compare(decimal(credit.baseCustomerCreditAmount).sub(credit.baseRefundedAmount)) > 0) throw new HTTPException(409, { message: 'Reverse later refunds first to preserve the remaining carrying-value cents' });
    const difference = decimal(baseAmount).sub(bookBase); const refundId = crypto.randomUUID();
    await repo.insertRefund(tx, { id: refundId, organisationId: ctx.organisationId, userId: ctx.userId, creditNoteId: id, bankAccountId: bank.id, amount: roundMoney(amount), refundDate: input.refundDate, currency: credit.currency, baseCurrency: credit.baseCurrency, exchangeRate: rate, exchangeRateId: rateId, baseAmount, bookBaseAmount: roundMoney(bookBase), exchangeDifference: roundMoney(difference), reference: input.reference ?? null });
    await postBalancedEntry(tx, ctx, { date: input.refundDate, description: `Refund ${credit.creditNoteNumber}`, referenceType: 'credit_note_refund', referenceId: refundId, lines: [
      { accountId: await repo.customerCreditAccount(tx, ctx), description: input.reference ?? credit.reason, debit: roundMoney(bookBase), credit: '0.00' },
      { accountId: await bankLedgerAccount(tx, ctx, bank), description: input.reference ?? credit.reason, debit: '0.00', credit: baseAmount },
      ...await exchangeDifferenceLine(tx, ctx, 'bill', roundMoney(difference)),
    ] });
    await repo.update(tx, ctx.organisationId, id, { refundedAmount: roundMoney(decimal(credit.refundedAmount).add(amount)), baseRefundedAmount: roundMoney(decimal(credit.baseRefundedAmount).add(bookBase)) });
    const result = required(await repo.note(tx, ctx.organisationId, id), 'Credit note');
    await insertIdempotencyRecord(tx, ctx, scope, { status: 201, body: result }); return result;
  });
}
export async function reverseCreditNoteRefundForUser(db: Database, userId: string, id: string, refundId: string, input: ReverseCreditNoteRequest) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const credit = required(await repo.note(tx, ctx.organisationId, id), 'Credit note');
    const refund = required(credit.refunds.find(row => row.id === refundId), 'Credit-note refund');
    if (refund.status === 'reversed') {
      if (refund.reversalDate !== input.date || refund.reversalReason !== input.reason) throw new HTTPException(409, { message: 'Refund was already reversed with different details' });
      return credit;
    }
    await assertAccountingDateOpen(tx, ctx.organisationId, refund.refundDate, input.date);
    await assertGstSourceOpen(tx, ctx.organisationId, [{ kind: 'customer_settlement', dates: [refund.refundDate, input.date] }]);
    if (input.date < refund.refundDate) throw new HTTPException(400, { message: 'Reversal date cannot precede the refund date' });
    // The last surviving allocation is reversed first, preserving cumulative
    // carrying-value cents when another refund is recorded afterwards.
    if (credit.refunds.some(row => row.status === 'completed' && (row.refundDate > refund.refundDate || (row.refundDate === refund.refundDate && row.createdAt > refund.createdAt)))) throw new HTTPException(409, { message: 'Reverse the latest refund first' });
    if (credit.currency !== credit.baseCurrency) await assertOpenSettlementPeriod(tx, ctx.organisationId, 'invoice', credit.invoiceId, input.date);
    await reversePosting(tx, ctx, { referenceType: 'credit_note_refund', referenceId: refund.id, reversalType: 'credit_note_refund_reversal', date: input.date, description: `Reverse refund ${credit.creditNoteNumber}: ${input.reason}` });
    await repo.reverseRefund(tx, ctx.organisationId, refund.id, input.date, input.reason);
    await repo.update(tx, ctx.organisationId, id, { refundedAmount: roundMoney(decimal(credit.refundedAmount).sub(refund.amount)), baseRefundedAmount: roundMoney(decimal(credit.baseRefundedAmount).sub(refund.bookBaseAmount)) });
    return required(await repo.note(tx, ctx.organisationId, id), 'Credit note');
  });
}
