import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import type { GstPreparationQuery } from '@ledgercraft/contracts';
import type { Database } from '../../db/client';
import { journalEntries } from '../../db/schema/accounts';
import { foreignCurrencyDocumentIds } from '../reports/reports.repository';
import { decimal } from '../invoices/money';

const salesTypes = ['invoice', 'invoice_cancellation', 'invoice_restore'];
const purchaseTypes = ['bill', 'bill_void', 'bill_restore', 'expense', 'expense_reversal'];
const reversalTypes = new Set(['invoice_cancellation', 'bill_void', 'expense_reversal']);

/** Gross is the immutable posting's balanced total, signed by movement type.
 * Current document status must not rewrite a historical GST period. */
export async function grossGstDocuments(tx: Database, organisationId: string, period: GstPreparationQuery) {
  const foreign = await foreignCurrencyDocumentIds(tx, organisationId, 'NZD');
  const rows = await tx.select({ referenceType: journalEntries.referenceType, referenceId: journalEntries.referenceId, amount: journalEntries.totalAmount })
    .from(journalEntries).where(and(eq(journalEntries.organisationId, organisationId),
      inArray(journalEntries.status, ['posted', 'reversed']), inArray(journalEntries.referenceType, [...salesTypes, ...purchaseTypes]),
      gte(journalEntries.entryDate, period.from), lte(journalEntries.entryDate, period.to)));
  const eligible = rows.filter((row) => !row.referenceId || !foreign.has(row.referenceId));
  const amounts = (types: string[]) => eligible.filter((row) => types.includes(row.referenceType!))
    .map((row) => ({ amount: reversalTypes.has(row.referenceType!) ? decimal(0).sub(row.amount).toFixed() : row.amount }));
  return { sales: amounts(salesTypes), purchases: amounts(purchaseTypes), hasReversals: eligible.some((row) => reversalTypes.has(row.referenceType!)) };
}
