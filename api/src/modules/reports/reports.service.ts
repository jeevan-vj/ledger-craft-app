import { accountStatementResponseSchema, financialReportResponseSchema, generalLedgerResponseSchema, type FinancialReportQuery } from '@ledgercraft/contracts';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import { withOrganisationTx } from '../auth/bind-organisation';
import { decimal, roundMoney } from '../invoices/money';
import { buildFinancialReport } from './reports.engine';
import * as repo from './reports.repository';

export async function financialReportForUser(db: Database, userId: string, query: FinancialReportQuery) {
  return withOrganisationTx(db, userId, (tx, ctx) => financialReportInTx(tx, ctx.organisationId, query));
}

export async function financialReportInTx(tx: Database, organisationId: string, query: FinancialReportQuery) {
    const [periodRows, openingRows, taxRows, receivables, payables] = await Promise.all([
      repo.ledgerRows(tx, organisationId, query), repo.ledgerRows(tx, organisationId, query, query.from),
      query.basis === 'accrual' ? repo.ledgerRows(tx, organisationId, query) : repo.ledgerRows(tx, organisationId, { ...query, basis: 'accrual' }),
      repo.receivables(tx, organisationId, query), repo.payables(tx, organisationId, query),
    ]);
    let comparison;
    if (query.comparisonFrom && query.comparisonTo) {
      comparison = { from: query.comparisonFrom, to: query.comparisonTo, rows: await repo.ledgerRows(tx, organisationId, { ...query, from: query.comparisonFrom, to: query.comparisonTo, comparisonFrom: undefined, comparisonTo: undefined }) };
    }
    return financialReportResponseSchema.parse(buildFinancialReport({ query, periodRows, openingRows, taxRows, receivables, payables, comparison }));
}

export async function generalLedgerForUser(db: Database, userId: string, query: FinancialReportQuery) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const [rows, opening] = await Promise.all([repo.ledgerRows(tx, ctx.organisationId, query), repo.ledgerRows(tx, ctx.organisationId, query, query.from)]);
    const balances = new Map<string, ReturnType<typeof decimal>>();
    for (const row of opening) balances.set(row.accountId, (balances.get(row.accountId) ?? decimal(0)).add(row.debit).sub(row.credit));
    const lines = rows.map((row) => {
      const running = (balances.get(row.accountId) ?? decimal(0)).add(row.debit).sub(row.credit); balances.set(row.accountId, running);
      return { journalEntryId: row.journalEntryId, entryNumber: row.entryNumber, date: row.date, description: row.description, referenceType: row.referenceType, referenceId: row.referenceId, accountId: row.accountId, accountNumber: row.accountNumber, accountName: row.accountName, debit: roundMoney(row.debit), credit: roundMoney(row.credit), runningBalance: roundMoney(running) };
    });
    return generalLedgerResponseSchema.parse({ meta: { from: query.from, to: query.to, basis: query.basis, baseCurrency: query.baseCurrency, generatedAt: new Date().toISOString() }, lines });
  });
}

export async function accountStatementForUser(db: Database, userId: string, accountId: string, query: FinancialReportQuery) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const account = await repo.account(tx, ctx.organisationId, accountId); if (!account) throw new HTTPException(404, { message: 'Account not found' });
    const scoped = { ...query, accountIds: [accountId] };
    const [rows, openingRows] = await Promise.all([repo.ledgerRows(tx, ctx.organisationId, scoped), repo.ledgerRows(tx, ctx.organisationId, scoped, query.from)]);
    let running = openingRows.reduce((sum, row) => sum.add(row.debit).sub(row.credit), decimal(account.openingBalance)); const openingBalance = roundMoney(running);
    const movements = rows.map((row) => { running = running.add(row.debit).sub(row.credit); return { journalEntryId: row.journalEntryId, entryNumber: row.entryNumber, date: row.date, description: row.description, referenceType: row.referenceType, referenceId: row.referenceId, accountId: row.accountId, accountNumber: row.accountNumber, accountName: row.accountName, debit: roundMoney(row.debit), credit: roundMoney(row.credit), runningBalance: roundMoney(running) }; });
    return accountStatementResponseSchema.parse({ meta: { from: query.from, to: query.to, basis: query.basis, baseCurrency: query.baseCurrency, generatedAt: new Date().toISOString() }, account: { id: account.id, number: account.accountNumber, name: account.name, currency: account.currency }, openingBalance, movements, closingBalance: roundMoney(running) });
  });
}
