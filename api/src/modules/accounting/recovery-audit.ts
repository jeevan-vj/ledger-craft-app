import type { LedgerAuditFinding, LedgerAuditResponse } from '@ledgercraft/contracts';
import { decimal, roundMoney } from '../invoices/money';
import type { recoverySnapshot } from './recovery.repository';

type Snapshot = Awaited<ReturnType<typeof recoverySnapshot>>;
type Candidate = Omit<LedgerAuditFinding, 'fingerprint'>;
export async function fingerprint(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Conservative proposals: ambiguous or reversed sources are never repaired.
 * Receipt percentages are proposals requiring original-receipt confirmation. */
export async function deriveAudit(snapshot: Snapshot): Promise<LedgerAuditResponse> {
  const findings: LedgerAuditFinding[] = [];
  const warnings = new Set<string>();
  const linesFor = (id: string) => snapshot.lines.filter((line) => line.journalEntryId === id);
  const account = (id: string) => snapshot.accountRows.find((row) => row.id === id);
  const accountNumber = (id: string) => account(id)?.accountNumber;
  const sourceEntry = (type: string, id: string) => snapshot.entries.filter((entry) => entry.status === 'posted' && entry.referenceType === type && entry.referenceId === id);
  const add = async (candidate: Candidate, evidence: unknown) => {
    if (snapshot.entries.some((entry) => entry.referenceType === 'ledger_audit_correction' && entry.referenceId === candidate.key)) return;
    findings.push({ ...candidate, fingerprint: await fingerprint({ candidate, evidence }) });
  };
  for (const [type, documents] of [['invoice', snapshot.invoiceRows], ['bill', snapshot.supplierBills]] as const) {
    for (const document of documents.filter((row) => row.currency !== 'NZD')) {
      const entries = sourceEntry(type, document.id);
      if (entries.some((entry) => decimal(entry.totalAmount).compare(document.baseTotal) !== 0)) {
        warnings.add(`Historical foreign ${type} ${document.id} differs from its base-currency snapshot. Review the original rate and postings manually; this audit does not invent an exchange correction.`);
      }
    }
  }
  for (const payment of snapshot.supplierPayments.filter((row) => row.status === 'completed')) {
    const bill = snapshot.supplierBills.find((row) => row.id === payment.billId);
    const bank = snapshot.banks.find((row) => row.id === payment.bankAccountId);
    if (!bill || bill.currency !== 'NZD' || !bank || bank.currency !== 'NZD') continue;
    const entries = sourceEntry('bill_payment', payment.id);
    if (entries.length !== 1) continue;
    const entry = entries[0]!;
    const lines = linesFor(entry.id);
    const wrongCash = lines.find((line) => accountNumber(line.accountId) === '1110' && decimal(line.creditAmount).compare(payment.amount) === 0 && decimal(line.debitAmount).compare(0) === 0);
    const ap = lines.find((line) => accountNumber(line.accountId) === '2100' && decimal(line.debitAmount).compare(payment.amount) === 0 && decimal(line.creditAmount).compare(0) === 0);
    if (lines.length !== 2 || !wrongCash || !ap) continue;
    const target = snapshot.accountRows.find((row) => row.accountNumber === `BANK-${bank.id.slice(0, 8).toUpperCase()}`);
    await add({ key: `supplier-bank:${entry.id}`, type: 'supplier_bank', sourceId: payment.id, sourceJournalId: entry.id, sourceDate: entry.entryDate,
      description: `Move the supplier payment cash credit to its explicitly selected bank: ${bank.accountName}`,
      requiresReceiptConfirmation: false, actual: { bankAccount: wrongCash.accountId, amount: roundMoney(payment.amount) }, expected: { bankAccount: target?.id ?? `bank:${bank.id}`, bankName: bank.accountName, amount: roundMoney(payment.amount) },
      correctionLines: [{ accountId: wrongCash.accountId, debit: roundMoney(payment.amount), credit: '0.00' }, { accountId: target?.id ?? `bank:${bank.id}`, debit: '0.00', credit: roundMoney(payment.amount) }],
    }, { payment, bank, lines });
  }
  for (const expense of snapshot.expenseRows.filter((row) => row.status === 'approved' && row.currency === 'NZD')) {
    const entries = sourceEntry('expense', expense.id);
    if (entries.length !== 1) continue;
    const entry = entries[0]!;
    const lines = linesFor(entry.id);
    const gst = lines.find((line) => accountNumber(line.accountId) === '2150' && decimal(line.creditAmount).compare(0) === 0);
    const cost = lines.find((line) => accountNumber(line.accountId) === '5000' && decimal(line.creditAmount).compare(0) === 0);
    const cash = lines.find((line) => ['bank', 'cash', 'credit_card', 'loan'].includes(account(line.accountId)?.type ?? '') && decimal(line.creditAmount).compare(expense.baseAmount) === 0 && decimal(line.debitAmount).compare(0) === 0);
    if (lines.length !== 3 || !gst || !cost || !cash) continue;
    const eligible = roundMoney(['exempt', 'zero_rated'].includes(expense.gstTreatment) ? '0' : decimal(expense.baseTaxAmount).mul(String(expense.gstClaimablePercentage)).div('100').mul(decimal('100').sub(String(expense.privateUsePercentage))).div('100'));
    const actual = roundMoney(gst.debitAmount);
    const difference = decimal(actual).sub(eligible);
    if (difference.compare(0) <= 0 || decimal(cost.debitAmount).add(actual).compare(expense.baseAmount) !== 0) continue;
    warnings.add('Expense GST proposals assume the stored GST is the original receipt GST. Confirm it against the receipt; legacy pre-adjusted amounts must be reviewed manually.');
    await add({ key: `expense-gst:${entry.id}`, type: 'expense_gst', sourceId: expense.id, sourceJournalId: entry.id, sourceDate: entry.entryDate,
      description: `Reduce input GST and include the nonclaimable part in expense cost: ${expense.description}`,
      requiresReceiptConfirmation: true, actual: { inputGst: actual, expenseCost: roundMoney(cost.debitAmount), receiptGst: roundMoney(expense.baseTaxAmount) }, expected: { inputGst: eligible, expenseCost: roundMoney(decimal(expense.baseAmount).sub(eligible)), cashPaid: roundMoney(expense.baseAmount) },
      correctionLines: [{ accountId: cost.accountId, debit: roundMoney(difference), credit: '0.00' }, { accountId: gst.accountId, debit: '0.00', credit: roundMoney(difference) }],
    }, { expense, lines });
  }
  for (const match of snapshot.matches) {
    const transaction = snapshot.transactions.find((row) => row.id === match.bankTransactionId && row.source === 'import');
    if (!transaction || !transaction.isReconciled) continue;
    const bank = snapshot.banks.find((row) => row.id === transaction.bankAccountId && row.currency === 'NZD');
    if (!bank) continue;
    const type = match.paymentId ? 'invoice_payment' : match.expenseId ? 'expense' : undefined;
    const id = match.paymentId ?? match.expenseId;
    if (!type || !id) continue;
    if (snapshot.matches.filter((row) => type === 'invoice_payment' ? row.paymentId === id : row.expenseId === id).length !== 1) {
      warnings.add('A book settlement has multiple confirmed bank matches. Compare the original statements manually before correcting it.');
      continue;
    }
    if (type === 'invoice_payment') {
      const payment = snapshot.invoicePayments.find((row) => row.id === id);
      const invoice = snapshot.invoiceRows.find((row) => row.id === payment?.invoiceId);
      if (!invoice || invoice.currency !== 'NZD') continue;
    }
    const book = type === 'invoice_payment' ? snapshot.invoicePayments.find((row) => row.id === id && row.status === 'completed') : snapshot.expenseRows.find((row) => row.id === id && row.status === 'approved' && row.currency === 'NZD');
    if (!book || decimal(book.amount).compare(transaction.amount) !== 0 || (type === 'invoice_payment') !== (transaction.type === 'credit')) continue;
    const imported = sourceEntry('bank_transaction', transaction.id);
    const original = sourceEntry(type, id);
    if (imported.length !== 1 || original.length !== 1) continue;
    if (snapshot.actions.some((action) => action.transactionId === transaction.id && action.status === 'active')) continue;
    const importedLines = linesFor(imported[0]!.id);
    const genericNumber = transaction.type === 'credit' ? '4900' : '5000';
    const generic = importedLines.find((line) => accountNumber(line.accountId) === genericNumber && decimal(transaction.type === 'credit' ? line.creditAmount : line.debitAmount).compare(transaction.amount) === 0);
    const bankLine = importedLines.find((line) => accountNumber(line.accountId) === `BANK-${bank.id.slice(0, 8).toUpperCase()}` && decimal(transaction.type === 'credit' ? line.debitAmount : line.creditAmount).compare(transaction.amount) === 0);
    const sourceCash = linesFor(original[0]!.id).filter((line) => ['bank', 'cash'].includes(account(line.accountId)?.type ?? '') && decimal(transaction.type === 'credit' ? line.debitAmount : line.creditAmount).compare(transaction.amount) === 0);
    if (importedLines.length !== 2 || !generic || !bankLine || sourceCash.length !== 1) continue;
    const amount = roundMoney(transaction.amount);
    const credit = transaction.type === 'credit';
    await add({ key: `bank-duplicate:${imported[0]!.id}`, type: 'duplicate_bank_posting', sourceId: transaction.id, sourceJournalId: imported[0]!.id, sourceDate: imported[0]!.entryDate,
      description: `Remove the generic import posting duplicated by confirmed ${type} ${id}; retain the original settlement and its GST`, requiresReceiptConfirmation: false,
      actual: { duplicatedCash: amount, duplicatedIncomeOrExpense: amount }, expected: { duplicatedCash: '0.00', duplicatedIncomeOrExpense: '0.00', originalSettlement: amount },
      correctionLines: credit ? [{ accountId: generic.accountId, debit: amount, credit: '0.00' }, { accountId: sourceCash[0]!.accountId, debit: '0.00', credit: amount }] : [{ accountId: sourceCash[0]!.accountId, debit: amount, credit: '0.00' }, { accountId: generic.accountId, debit: '0.00', credit: amount }],
    }, { match, transaction, importedLines, originalLines: linesFor(original[0]!.id) });
  }
  return { findings, warnings: [...warnings] };
}
