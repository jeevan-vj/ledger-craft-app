import { decimal, roundMoney } from '../invoices/money';
import type { sourceRows } from './customer-statements.repository';
export function statementMovements(source: Awaited<ReturnType<typeof sourceRows>>) {
    const sales = new Map(source.sales.map(v => [v.id, v]));
    const entries = new Map(source.entries.map(v => [v.id, v]));
    const receipts = new Map(source.receipts.map(v => [v.id, v.invoiceId]));
    const credits = new Map(source.credits.map(v => [v.id, v.invoiceId]));
    const refunds = new Map(source.refunds.map(v => [v.id, credits.get(v.creditNoteId)]));
    function invoiceOf(type: string | null, id: string | null, description: string | null, lineOrder: number, seen = new Set<string>()): string | undefined {
        if (!id || seen.has(id))
            return;
        seen.add(id);
        if (['invoice', 'invoice_cancellation', 'invoice_restore'].includes(type ?? ''))
            return id;
        if (type === 'invoice_payment')
            return receipts.get(id);
        if (type === 'credit_note')
            return credits.get(id);
        if (type === 'credit_note_refund')
            return refunds.get(id);
        if (type === 'fx_revaluation' || type === 'fx_revaluation_reversal')
            return /^\d{4}-\d{2}-\d{2}:invoice:(.+)$/.exec(id)?.[1];
        if (type === 'bank_reconciliation_accept') {
            const match = source.sales.find(v => description === `Invoice ${v.invoiceNumber}`);
            return source.connections.some(v => v.actionId === id && v.documentId === match?.id) ? match?.id : undefined;
        }
        const original = entries.get(id);
        const originalLine = source.lines.find(v => v.journalId === id && v.lineOrder === lineOrder);
        return original ? invoiceOf(original.referenceType, original.referenceId, originalLine?.description ?? description, lineOrder, seen) : undefined;
    }
    const grouped = new Map<string, {
        id: string;
        date: string;
        kind: string;
        reference: string;
        description: string;
        debit: ReturnType<typeof decimal>;
        credit: ReturnType<typeof decimal>;
        invoiceId: string;
    }>();
    for (const line of source.lines) {
        const invoiceId = invoiceOf(line.type, line.reference, line.description, line.lineOrder);
        const sale = invoiceId ? sales.get(invoiceId) : undefined;
        if (!sale)
            continue;
        const key = line.journalId + '-' + sale.id;
        const row = grouped.get(key) ?? { id: key, date: line.date, kind: line.type ?? 'journal', reference: line.type === 'invoice' ? sale.invoiceNumber : line.entryNumber, description: `${line.type?.replaceAll('_', ' ') ?? 'Accounting movement'} · ${sale.invoiceNumber}`, debit: decimal(0), credit: decimal(0), invoiceId: sale.id };
        row.debit = row.debit.add(line.debit);
        row.credit = row.credit.add(line.credit);
        grouped.set(key, row);
    }
    return [...grouped.values()].map(v => ({ ...v, debit: roundMoney(v.debit), credit: roundMoney(v.credit) }));
}
