import { generateGstPeriods, reportOptionsSchema, accountStatementResponseSchema, financialReportResponseSchema, generalLedgerResponseSchema, type FinancialReportQuery } from '@ledgercraft/contracts';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import { withOrganisationTx } from '../auth/bind-organisation';
import { decimal, roundMoney } from '../invoices/money';
import { buildFinancialReport } from './reports.engine';
import { getLocalization } from '../currency/currency.repository';
import { gstSettingsInTx } from '../tax/gst-settings';
import { localDateIn } from '../accounting/organisation-date';
import * as repo from './reports.repository';

export async function financialReportForUser(db: Database, userId: string, query: FinancialReportQuery) {
  return withOrganisationTx(db, userId, (tx, ctx) => financialReportInTx(tx, ctx.organisationId, query));
}

export async function financialReportInTx(tx: Database, organisationId: string, query: FinancialReportQuery, options?: { gstExcludedJournalIds?: ReadonlySet<string> }) {
    const cashHistory = query.basis === 'cash' ? await repo.cashLedgerHistory(tx,organisationId,query) : undefined;
    const [periodRows, openingRows, receivables, payables, cashFlowGroups] = await Promise.all([
      cashHistory ? cashHistory.rows.filter(row=>row.date>=query.from&&row.date<=query.to) : repo.ledgerRows(tx, organisationId, query),
      cashHistory ? cashHistory.rows.filter(row=>row.date<query.from) : repo.ledgerRows(tx, organisationId, query, query.from),
      repo.receivables(tx, organisationId, query), repo.payables(tx, organisationId, query), repo.cashFlowGroups(tx, organisationId),
    ]);
    // GST is read from the journals that actually carry 2150/2200. Payment
    // journals do not allocate GST, so the report's cash filter is not a valid
    // alternate GST basis: GST is always reported on the invoice basis. The
    // report's account filter narrows statements, never the GST return.
    const ledgerTaxRows = query.basis === 'accrual' && !query.accountIds?.length
      ? periodRows
      : await repo.ledgerRows(tx, organisationId, { ...query, basis: 'accrual', accountIds: undefined });
    const foreignIds = await repo.unconvertedForeignCurrencyDocumentReferences(tx, organisationId, query.baseCurrency);
    const excludedDocuments = new Set<string>();
    const taxRows = ledgerTaxRows.filter((row) => {
      if (options?.gstExcludedJournalIds?.has(row.journalEntryId)) return false;
      if (!row.referenceId || !foreignIds.has(row.referenceId)) return true;
      if (row.accountNumber === '2150' || row.accountNumber === '2200') excludedDocuments.add(foreignIds.get(row.referenceId)!);
      return false;
    });
    let comparison;
    if (query.comparisonFrom && query.comparisonTo) {
      comparison = { from: query.comparisonFrom, to: query.comparisonTo, rows: await repo.ledgerRows(tx, organisationId, { ...query, from: query.comparisonFrom, to: query.comparisonTo, comparisonFrom: undefined, comparisonTo: undefined }) };
    }
    return financialReportResponseSchema.parse(buildFinancialReport({ query, periodRows, openingRows, cashFlowGroups, cashWarnings:cashHistory?.warnings, taxRows, foreignCurrencyGstDocuments: excludedDocuments.size, receivables, payables, comparison }));
}

export async function generalLedgerForUser(db: Database, userId: string, query: FinancialReportQuery) {
  return withOrganisationTx(db, userId, (tx, ctx) => generalLedgerInTx(tx, ctx.organisationId, query));
}

/** Canonical ledger DTO, reusable by a consistent multi-report transaction. */
export async function generalLedgerInTx(tx: Database, organisationId: string, query: FinancialReportQuery) {
    const cashHistory=query.basis==='cash'?await repo.cashLedgerHistory(tx,organisationId,query):undefined;
    const [rows, opening] = await Promise.all([cashHistory?cashHistory.rows.filter(row=>row.date>=query.from):repo.ledgerRows(tx, organisationId, query),cashHistory?cashHistory.rows.filter(row=>row.date<query.from):repo.ledgerRows(tx, organisationId, query, query.from)]);
    const balances = new Map<string, ReturnType<typeof decimal>>();
    for (const row of opening) balances.set(row.accountId, (balances.get(row.accountId) ?? decimal(0)).add(row.debit).sub(row.credit));
    const lines = rows.map((row) => {
      const running = (balances.get(row.accountId) ?? decimal(0)).add(row.debit).sub(row.credit); balances.set(row.accountId, running);
      return { ...(row.sourceJournalEntryId?{sourceJournalEntryId:row.sourceJournalEntryId,sourceEntryNumber:row.sourceEntryNumber}:{}), journalEntryId: row.journalEntryId, entryNumber: row.entryNumber, date: row.date, description: row.description, referenceType: row.referenceType, referenceId: row.referenceId, accountId: row.accountId, accountNumber: row.accountNumber, accountName: row.accountName, debit: roundMoney(row.debit), credit: roundMoney(row.credit), runningBalance: roundMoney(running) };
    });
    return generalLedgerResponseSchema.parse({ meta: { from: query.from, to: query.to, basis: query.basis, baseCurrency: query.baseCurrency, generatedAt: new Date().toISOString(),...(query.basis==='cash'?{cashRecognition:'settled-source-components-v1',...(cashHistory?.warnings.length?{warnings:cashHistory.warnings}:{})}:{}) }, lines });
}

export async function accountStatementForUser(db: Database, userId: string, accountId: string, query: FinancialReportQuery) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const account = await repo.account(tx, ctx.organisationId, accountId); if (!account) throw new HTTPException(404, { message: 'Account not found' });
    const scoped = { ...query, accountIds: [accountId] };
    const [rows, openingRows] = await Promise.all([repo.ledgerRows(tx, ctx.organisationId, scoped), repo.ledgerRows(tx, ctx.organisationId, scoped, query.from)]);
    let running = openingRows.reduce((sum, row) => sum.add(row.debit).sub(row.credit), decimal(0)); const openingBalance = roundMoney(running);
    const movements = rows.map((row) => { running = running.add(row.debit).sub(row.credit); return { ...(row.sourceJournalEntryId?{sourceJournalEntryId:row.sourceJournalEntryId,sourceEntryNumber:row.sourceEntryNumber}:{}), journalEntryId: row.journalEntryId, entryNumber: row.entryNumber, date: row.date, description: row.description, referenceType: row.referenceType, referenceId: row.referenceId, accountId: row.accountId, accountNumber: row.accountNumber, accountName: row.accountName, debit: roundMoney(row.debit), credit: roundMoney(row.credit), runningBalance: roundMoney(running) }; });
    return accountStatementResponseSchema.parse({ meta: { from: query.from, to: query.to, basis: query.basis, baseCurrency: query.baseCurrency, generatedAt: new Date().toISOString() }, account: { id: account.id, number: account.accountNumber, name: account.name, currency: account.currency }, openingBalance, movements, closingBalance: roundMoney(running) });
  });
}

export async function reportOptionsForUser(db: Database, userId: string, now = new Date()) {
 return withOrganisationTx(db,userId,async(tx,ctx)=>{
  const [localization,organisationName,settings,choices]=await Promise.all([getLocalization(tx,ctx.organisationId),repo.reportBusinessName(tx,ctx.organisationId),gstSettingsInTx(tx,ctx.organisationId),repo.reportChoices(tx,ctx.organisationId)]);
  const today=localDateIn(now,localization.timezone);
  const periods=settings.configured&&settings.gstRegistrationStatus==='registered'?generateGstPeriods(settings,today):[];
  const current=periods.find(period=>period.periodStart<=today&&period.periodEnd>=today);
  return reportOptionsSchema.parse({...choices,organisationName,today,timezone:localization.timezone,financialYearStartMonth:localization.financialYearStartMonth,financialYearStartDay:localization.financialYearStartDay,gstPeriod:current?{periodStart:current.periodStart,periodEnd:current.periodEnd}:null});
 });
}
