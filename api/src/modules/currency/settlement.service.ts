import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import { decimal, roundMoney } from '../invoices/money';
import { convertToBase, currencyRepository, resolveDocumentCurrency } from './currency.service';
import { closedRevaluationDate, completedSettlementAmounts, exchangeAccount, sourcePostingTotal } from './settlement.repository';

export type SettlementSnapshot = {
  currency: string; baseCurrency: string; exchangeRate: string; exchangeRateId: string | null;
  baseAmount: string; bookBaseAmount: string; exchangeDifference: string;
};

/** Allocate carrying value cumulatively so the final instalment clears all cents. */
export async function settlementSnapshot(tx: Database, organisationId: string, input: {
  type: 'invoice' | 'bill'; documentId: string; currency: string; baseCurrency: string;
  total: string; baseTotal: string; amount: string; date: string; exchangeRateId?: string; outstanding?: string; baseCredited?: string;
}): Promise<SettlementSnapshot> {
  const resolved = await resolveDocumentCurrency(tx, organisationId, input.currency, input.date);
  if (resolved.base.code !== input.baseCurrency) throw new HTTPException(409, { message: 'Document and company base currencies disagree; review the source document' });
  let rate = resolved.rate;
  let rateId = resolved.rateId;
  if (input.exchangeRateId) {
    const selected = await currencyRepository.getRateById(tx, organisationId, input.exchangeRateId);
    if (!selected || selected.currencyCode !== input.currency || selected.baseCurrency !== resolved.base.code || selected.effectiveDate > input.date) {
      throw new HTTPException(422, { message: 'Select a reviewed rate for this company, document currency and payment date' });
    }
    rate = selected.rate; rateId = selected.id;
  }
  const baseAmount = convertToBase(input.amount, rate, resolved.base.precision);
  if (input.currency === input.baseCurrency) return {
    currency: input.currency, baseCurrency: input.baseCurrency, exchangeRate: '1', exchangeRateId: null,
    baseAmount, bookBaseAmount: baseAmount, exchangeDifference: '0.00',
  };
  await assertOpenSettlementPeriod(tx, organisationId, input.type, input.documentId, input.date);
  const posted = await sourcePostingTotal(tx, organisationId, input.type, input.documentId);
  if (!posted || decimal(posted).compare(input.baseTotal) !== 0) {
    throw new HTTPException(409, { message: 'The historical foreign source journal needs an accounting audit before settlement' });
  }
  const prior = await completedSettlementAmounts(tx, organisationId, input.type, input.documentId);
  if (prior.some((row) => row.bookBaseAmount === null)) throw new HTTPException(409, { message: 'Historical foreign settlements lack carrying-value snapshots; complete the accounting audit first' });
  const paid = prior.reduce((sum, row) => sum.add(row.amount), decimal(0));
  const cleared = prior.reduce((sum, row) => sum.add(row.bookBaseAmount!), decimal(0));
  const cumulative = decimal(input.baseTotal).mul(paid.add(input.amount)).div(input.total);
  const final = input.outstanding !== undefined && decimal(input.amount).compare(input.outstanding) === 0;
  const bookBaseAmount = final ? roundMoney(decimal(input.baseTotal).sub(input.baseCredited ?? '0').sub(cleared)) : roundMoney(decimal(roundMoney(cumulative)).sub(cleared));
  if (decimal(bookBaseAmount).compare(0) < 0) throw new HTTPException(409, { message: 'Review the historical carrying value before settling this document' });
  return {
    currency: input.currency, baseCurrency: input.baseCurrency, exchangeRate: rate, exchangeRateId: rateId,
    baseAmount, bookBaseAmount, exchangeDifference: roundMoney(decimal(baseAmount).sub(bookBaseAmount)),
  };
}

export async function exchangeDifferenceLine(tx: Database, ctx: { organisationId: string; userId: string }, type: 'invoice' | 'bill', difference: string) {
  const diff = decimal(difference);
  if (diff.compare(0) === 0) return [];
  const gain = type === 'invoice' ? diff.compare(0) > 0 : diff.compare(0) < 0;
  const amount = roundMoney(diff.abs());
  const accountId = await exchangeAccount(tx, ctx, gain);
  if (!accountId) throw new HTTPException(409, { message: 'The reserved realized exchange account must be active with the correct revenue/expense classification and normal balance' });
  return [{ accountId, description: 'Realized foreign exchange difference', debit: gain ? '0.00' : amount, credit: gain ? amount : '0.00' }];
}

export async function assertOpenSettlementPeriod(tx: Database, organisationId: string, type: 'invoice' | 'bill', documentId: string, date: string) {
  const closed = await closedRevaluationDate(tx, organisationId, type, documentId, date);
  if (closed) throw new HTTPException(409, { message: `This document was revalued through ${closed}; settlement and corrections must be dated after the reviewed period` });
}
