import { decimal, roundMoney } from '../invoices/money';
import type { LedgerRow } from './reports.repository';
import type { CashRecognitionLinks } from './cash-recognition.repository';
type Amount = ReturnType<typeof decimal>;
type Component = {
  row: LedgerRow;
  amount: Amount;
};
type Source = {
  id: string;
  kind: 'invoice' | 'bill' | 'refund';
  gross: Amount;
  components: Component[];
};
type Position = {
  source: Source;
  paid: Amount;
  gross: Amount;
  budget: Map<string, Amount>;
  recognised: Map<string, Amount>;
};
const zero = () => decimal(0);
const debit = (row: LedgerRow) => decimal(row.debit).sub(row.credit);
const cash = (row: LedgerRow) => ['bank', 'cash'].includes(row.accountType);
/** Read-only report presentation. Existing source and settlement journals stay
* immutable. AR/AP carrying clearances are allocated to their posted source
* components; GST stays on its balance-sheet account, never P&L income/cost. */
export function recogniseCashRows(rows: LedgerRow[], links: CashRecognitionLinks): {
  rows: LedgerRow[];
  warnings: string[];
} {
  const warnings = new Set<string>();
  if ([...links.settlements.sales, ...links.settlements.purchases, ...links.settlements.refunds].some(s => s.currency !== 'NZD' && s.bookBaseAmount == null))
    warnings.add('Historical foreign settlements lack reviewed carrying snapshots. Cash uses their recorded journal amounts; audit these before relying on the result.');
  const grouped = new Map<string, LedgerRow[]>();
  for (const row of rows) {
    const group = grouped.get(row.journalEntryId) ?? [];
    group.push(row);
    grouped.set(row.journalEntryId, group);
  }
  const entries = [...grouped.values()].sort((a, b) => a[0].date.localeCompare(b[0].date) || (a[0].createdAt ?? 0) - (b[0].createdAt ?? 0) || a[0].journalEntryId.localeCompare(b[0].journalEntryId));
  const originals = new Map<string, LedgerRow[]>();
  for (const group of entries) {
    const row = group[0];
    if (['invoice', 'bill', 'credit_note'].includes(row.referenceType ?? '') && row.referenceId && !originals.has(`${row.referenceType}:${row.referenceId}`))
      originals.set(`${row.referenceType}:${row.referenceId}`, group);
  }
  const receipt = new Map(links.settlements.sales.map(r => [r.id, r.documentId]));
  const payments = new Map(links.settlements.purchases.map(r => [r.id, r.documentId]));
  const refund = new Map(links.settlements.refunds.map(r => [r.id, r]));
  const notes = new Map(links.settlements.credits.map(r => [r.id, r]));
  const positions = new Map<string, Position>();
  function source(kind: 'invoice' | 'bill', id: string): Source | undefined { const sourceRows = originals.get(`${kind}:${id}`); if (!sourceRows)
    return; const code = kind === 'invoice' ? '1200' : '2100'; const sign = kind === 'invoice' ? '-1' : '1'; const components = new Map<string, Component>(); for (const row of sourceRows.filter(r => r.accountNumber !== code)) {
    const current = components.get(row.accountId);
    components.set(row.accountId, { row, amount: (current?.amount ?? zero()).add(debit(row).mul(sign)) });
  } const gross = sourceRows.filter(r => r.accountNumber === code).reduce((sum, r) => kind === 'invoice' ? sum.add(debit(r)) : sum.sub(debit(r)), zero()); if ([...components.values()].some(c => c.amount.compare(0) < 0) || [...components.values()].reduce((sum, c) => sum.add(c.amount), zero()).compare(gross) !== 0) {
    warnings.add('Cash P&L has an unsupported or unbalanced original source journal. Its settlement remains unallocated; review the original posting.');
    return;
  } return { id, kind, gross, components: [...components.values()].sort((a, b) => Number(!['2150', '2200'].includes(a.row.accountNumber ?? '')) - Number(!['2150', '2200'].includes(b.row.accountNumber ?? ''))) }; }
  function pos(value: Source) { const key = `${value.kind}:${value.id}`; let p = positions.get(key); if (!p) {
    p = { source: value, paid: zero(), gross: value.gross, budget: new Map(value.components.map(c => [c.row.accountId, c.amount])), recognised: new Map() };
    positions.set(key, p);
  } return p; }
  function allocations(p: Position, entry: LedgerRow, orientation: 'credit' | 'debit') {
    if (p.gross.compare(0) <= 0 && p.paid.compare(0) !== 0) {
      warnings.add('Cash P&L has an unsupported settlement budget; review source allocations.');
      return [];
    }
    let remaining = p.paid;
    const result: LedgerRow[] = [];
    for (const [index, component] of p.source.components.entries()) {
      const target = p.paid.compare(0) === 0 ? zero() : index === p.source.components.length - 1 ? remaining : decimal(roundMoney((p.budget.get(component.row.accountId) ?? zero()).mul(p.paid).div(p.gross)));
      remaining = remaining.sub(target);
      const delta = target.sub(p.recognised.get(component.row.accountId) ?? zero());
      p.recognised.set(component.row.accountId, target);
      if (delta.compare(0) === 0)
        continue;
      const signed = orientation === 'debit' ? delta : zero().sub(delta);
      result.push({ ...component.row, sourceJournalEntryId: component.row.journalEntryId, sourceEntryNumber: component.row.entryNumber, journalEntryId: entry.journalEntryId, entryNumber: entry.entryNumber, date: entry.date, createdAt: entry.createdAt, referenceType: entry.referenceType, referenceId: entry.referenceId, description: `Cash recognition: ${entry.description}`, debit: roundMoney(signed.compare(0) > 0 ? signed : zero()), credit: roundMoney(signed.compare(0) < 0 ? zero().sub(signed) : zero()) });
    }
    return result;
  }
  function matchedSource(row: LedgerRow, group: LedgerRow[], seen = new Set<string>()): Source | undefined {
    if (seen.has(row.journalEntryId))
      return;
    seen.add(row.journalEntryId);
    const id = row.referenceId ?? '';
    if (row.referenceType === 'invoice_payment') {
      const document = receipt.get(id);
      return document ? source('invoice', document) : undefined;
    }
    if (row.referenceType === 'bill_payment') {
      const document = payments.get(id);
      return document ? source('bill', document) : undefined;
    }
    if (row.referenceType === 'bank_reconciliation_accept') {
      const kind = row.accountNumber === '1200' ? 'invoice' : 'bill';
      const documents = kind === 'invoice' ? links.sales : links.purchases;
      const candidates = links.actions.filter(a => a.actionId === id && a.documentType === kind);
      const document = candidates.find(a => documents.find(d => d.id === a.documentId)?.number === (row.lineDescription ?? '').replace(/^(Invoice|Bill) /, ''));
      return document ? source(kind, document.documentId) : undefined;
    }
    if (['invoice_payment_reversal', 'bill_payment_reversal', 'bank_reconciliation_undo'].includes(row.referenceType ?? '')) {
      const original = grouped.get(id);
      if (!original)
        return;
      const controls = group.filter(r => r.accountNumber === row.accountNumber);
      const index = controls.indexOf(row);
      const originalControl = original.filter(r => r.accountNumber === row.accountNumber)[index];
      return originalControl ? matchedSource(originalControl, original, seen) : undefined;
    }
  }
  function noteComponents(id: string, gross: Amount, tax: Amount): Component[] | undefined {
    const sourceRows = originals.get(`credit_note:${id}`);
    if (!sourceRows)
      return;
    const revenueRows = sourceRows.filter(r => r.accountClass === 'revenue');
    const taxRow = sourceRows.find(r => r.accountNumber === '2200');
    if (revenueRows.length !== 1 || (!taxRow && tax.compare(0) !== 0))
      return;
    return [...(taxRow ? [{ row: taxRow, amount: tax }] : []), { row: revenueRows[0], amount: gross.sub(tax) }];
  }
  const output: LedgerRow[] = [];
  for (const group of entries) {
    const entry = group[0];
    const type = entry.referenceType ?? '';
    if (type === 'credit_note' || type === 'credit_note_reversal') {
      const original = type === 'credit_note' ? group : grouped.get(entry.referenceId ?? '');
      const note = original ? notes.get(original[0].referenceId ?? '') : undefined;
      if (note) {
        const value = source('invoice', note.documentId);
        const controls = original!.filter(r => r.accountNumber === '1200');
        const gross = controls.reduce((sum, r) => sum.sub(debit(r)), zero());
        const tax = decimal(note.tax).sub(note.liabilityTax);
        const components = noteComponents(note.id, gross, tax);
        if (value && components) {
          const position = pos(value);
          const sign = type === 'credit_note' ? '1' : '-1';
          position.gross = position.gross.sub(gross.mul(sign));
          for (const component of components)
            position.budget.set(component.row.accountId, (position.budget.get(component.row.accountId) ?? zero()).sub(component.amount.mul(sign)));
          output.push(...allocations(position, entry, 'credit'));
        }
        else if (gross.compare(0) !== 0)
          warnings.add('Cash P&L has an unallocated credit note; review its original invoice source.');
      }
      continue;
    }
    if (!group.some(cash) && !['bank_reconciliation_accept', 'bank_reconciliation_personal', 'bank_reconciliation_undo'].includes(type))
      continue;
    let refundRecord = type === 'credit_note_refund' ? refund.get(entry.referenceId ?? '') : undefined;
    if (type === 'credit_note_refund_reversal') {
      const original = grouped.get(entry.referenceId ?? '');
      refundRecord = original ? refund.get(original[0].referenceId ?? '') : undefined;
    }
    for (const row of group) {
      if (refundRecord && row.accountNumber === '2300') {
        const gross = decimal(refundRecord.baseTotal);
        const components = noteComponents(refundRecord.documentId, gross, decimal(refundRecord.tax));
        if (components && gross.compare(0) > 0) {
          const p = pos({ id: refundRecord.documentId, kind: 'refund', gross, components });
          p.paid = p.paid.add(debit(row));
          output.push(...allocations(p, row, 'debit'));
          continue;
        }
        warnings.add('Cash P&L has a refund without a verified original credit allocation.');
      }
      if (['1200', '2100'].includes(row.accountNumber ?? '')) {
        const value = matchedSource(row, group);
        if (value && value.gross.compare(0) > 0) {
          const p = pos(value);
          p.paid = p.paid.add(value.kind === 'invoice' ? zero().sub(debit(row)) : debit(row));
          output.push(...allocations(p, row, value.kind === 'invoice' ? 'credit' : 'debit'));
          continue;
        }
        warnings.add('Cash P&L includes an unallocated receivable/payable settlement. Its cash remains visible, but review source recognition before relying on income or costs.');
      }
      output.push(row);
    }
  }
  return { rows: output, warnings: [...warnings] };
}
