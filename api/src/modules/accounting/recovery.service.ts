import type { ApplyLedgerAuditRequest, ApplyLedgerAuditResponse, LedgerAuditResponse, OpeningBalancesRequest, OpeningBalancesResponse } from '@ledgercraft/contracts';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import { withOrganisationTx } from '../auth/bind-organisation';
import { decimal, roundMoney } from '../invoices/money';
import { bankLedgerAccount, postBalancedEntry } from './posting';
import { companyAccounts, openingEntries, recoverySnapshot } from './recovery.repository';
import { insertAction } from '../reconciliation/reconciliation-actions.repository';
import { deriveAudit, fingerprint } from './recovery-audit';

export async function postOpeningBalancesForUser(db: Database, userId: string, input: OpeningBalancesRequest): Promise<OpeningBalancesResponse> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const accounts = await companyAccounts(tx, ctx.organisationId);
    const lines = input.lines.map((line) => {
      const account = accounts.find((row) => row.id === line.accountId);
      if (!account) throw new HTTPException(400, { message: 'Opening account does not belong to this company' });
      if (!account.isActive) throw new HTTPException(400, { message: 'Opening accounts must be active' });
      if (account.currency !== 'NZD') throw new HTTPException(400, { message: 'Opening journals are NZD base amounts; use an NZD account' });
      if ((decimal(line.debit).compare(0) > 0) === (decimal(line.credit).compare(0) > 0)) throw new HTTPException(400, { message: 'Each opening line must have a positive amount on exactly one side' });
      return { accountId: line.accountId, debit: roundMoney(line.debit), credit: roundMoney(line.credit) };
    });
    const debit = lines.reduce((sum, line) => sum.add(line.debit), decimal(0));
    const credit = lines.reduce((sum, line) => sum.add(line.credit), decimal(0));
    if (debit.compare(credit) !== 0 || debit.compare(0) <= 0) throw new HTTPException(400, { message: 'Opening journal debits and credits must balance' });
    if (new Set(lines.map((line) => line.accountId)).size !== lines.length) throw new HTTPException(400, { message: 'Use one opening line per account' });
    const hash = await fingerprint({ date: input.date, reference: input.reference, lines: [...lines].sort((a, b) => a.accountId.localeCompare(b.accountId)) });
    const description = `Opening balances: ${input.reference} [${hash}]`;
    const existing = await openingEntries(tx, ctx.organisationId);
    if (existing.length) {
      const same = existing.find((entry) => entry.status === 'posted' && entry.description === description && entry.entryDate === input.date);
      if (!same) throw new HTTPException(409, { message: 'Opening balances already exist; post a reviewed correction instead of another opening' });
      return { journalEntryId: same.id, date: input.date, reference: input.reference, total: roundMoney(debit), replayed: true };
    }
    const journalEntryId = await postBalancedEntry(tx, ctx, { date: input.date, description, referenceType: 'opening_balance', referenceId: 'initial', lines: lines.map((line) => ({ ...line, description: input.reference })) });
    return { journalEntryId, date: input.date, reference: input.reference, total: roundMoney(debit), replayed: false };
  });
}

export async function auditLedgerForUser(db: Database, userId: string): Promise<LedgerAuditResponse> {
  return withOrganisationTx(db, userId, async (tx, ctx) => deriveAudit(await recoverySnapshot(tx, ctx.organisationId)));
}

export async function applyLedgerAuditForUser(db: Database, userId: string, input: ApplyLedgerAuditRequest): Promise<ApplyLedgerAuditResponse> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const snapshot = await recoverySnapshot(tx, ctx.organisationId);
    const audit = await deriveAudit(snapshot);
    const corrections: ApplyLedgerAuditResponse['corrections'] = [];
    if (new Set(input.findings.map((finding) => finding.key)).size !== input.findings.length) throw new HTTPException(400, { message: 'Select each audit finding once' });
    for (const selection of input.findings) {
      const existing = snapshot.entries.find((entry) => entry.referenceType === 'ledger_audit_correction' && entry.referenceId === selection.key);
      if (existing) {
        if (existing.status !== 'posted' || !existing.description.includes(`[${selection.fingerprint}]`)) throw new HTTPException(409, { message: 'Correction evidence changed or was reversed; review manually' });
        corrections.push({ key: selection.key, journalEntryId: existing.id, replayed: true });
        continue;
      }
      const finding = audit.findings.find((row) => row.key === selection.key);
      if (!finding) throw new HTTPException(409, { message: 'Finding is no longer available in this company; refresh the audit' });
      if (finding.fingerprint !== selection.fingerprint) throw new HTTPException(409, { message: 'Audit evidence changed; refresh and review the proposed correction' });
      if (input.date < finding.sourceDate) throw new HTTPException(400, { message: 'Correction date must be on or after the original source date' });
      if (finding.requiresReceiptConfirmation && selection.receiptGstConfirmed !== true) throw new HTTPException(400, { message: 'Confirm the stored receipt GST against the original receipt before correcting this expense' });
      const resolvedLines = await Promise.all(finding.correctionLines.map(async (line) => {
        if (!line.accountId.startsWith('bank:')) return line;
        const bank = snapshot.banks.find((row) => row.id === line.accountId.slice(5));
        if (!bank) throw new HTTPException(409, { message: 'Selected source bank is no longer available' });
        return { ...line, accountId: await bankLedgerAccount(tx, ctx, bank) };
      }));
      const journalEntryId = await postBalancedEntry(tx, ctx, { date: input.date, description: `Reviewed ledger correction: ${input.reason} [${finding.fingerprint}]`, referenceType: 'ledger_audit_correction', referenceId: finding.key, lines: resolvedLines.map((line) => ({ ...line, description: `${finding.type}: ${finding.sourceId}` })) });
      if (finding.type === 'duplicate_bank_posting') await insertAction(tx, ctx, { transactionId: finding.sourceId, actionType: 'accept', journalEntryId });
      corrections.push({ key: finding.key, journalEntryId, replayed: false });
    }
    return { corrections };
  });
}
