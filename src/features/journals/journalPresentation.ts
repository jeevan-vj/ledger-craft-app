import type { JournalEntryRow } from './api/journalsApi';
import { roundMoney } from '../../../api/src/modules/invoices/money';
import { csvRow } from '@/lib/csv';

// The current API supplies complete lines/totals. Two-account fallback is only
// for older presentation fixtures; no journal total is inferred from its lines.
export function journalPostingLines(entry: JournalEntryRow) {
  return entry.lines?.length ? entry.lines : [
    { id: `${entry.id}-debit`, accountId: entry.debitAccountId, accountName: entry.debitAccountName, debitAmount: roundMoney(String(entry.debitAmount)), creditAmount: '0.00', description: entry.description, lineOrder: 1 },
    { id: `${entry.id}-credit`, accountId: entry.creditAccountId, accountName: entry.creditAccountName, debitAmount: '0.00', creditAmount: roundMoney(String(entry.creditAmount)), description: entry.description, lineOrder: 2 },
  ];
}
export const journalDebitTotal = (entry: JournalEntryRow) => entry.debitTotal ?? roundMoney(String(entry.debitAmount));
export const journalCreditTotal = (entry: JournalEntryRow) => entry.creditTotal ?? roundMoney(String(entry.creditAmount));
export function journalEntriesCsv(entries: JournalEntryRow[]) {
  return [csvRow(['Entry', 'Date', 'Description', 'Reference', 'Account', 'Debit', 'Credit', 'Status']), ...entries.flatMap(entry => journalPostingLines(entry).map(line => csvRow([entry.entryNumber, entry.entryDate, line.description ?? entry.description, entry.referenceNumber, line.accountName, line.debitAmount, line.creditAmount, entry.status])))].join('\n');
}
