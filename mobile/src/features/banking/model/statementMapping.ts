import { parseBankStatementCsv, type StatementTransactionInput } from './statementImport';

export interface StatementMapping { date: string; description: string; amount: string; debit?: string; credit?: string; reference?: string; dateFormat: 'YYYY-MM-DD' | 'DD/MM/YYYY' }
function rows(csv: string): string[][] {
  const result: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (c === '"') { if (quoted && csv[i + 1] === '"') { cell += c; i++; } else quoted = !quoted; }
    else if (c === ',' && !quoted) { row.push(cell.trim()); cell = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) { if (c === '\r' && csv[i + 1] === '\n') i++; row.push(cell.trim()); if (row.some(Boolean)) result.push(row); row = []; cell = ''; }
    else cell += c;
  }
  row.push(cell.trim()); if (row.some(Boolean)) result.push(row);
  if (quoted) throw new Error('The CSV contains an unclosed quoted value.');
  return result;
}
export const statementCsvColumns = (csv: string) => (rows(csv)[0] ?? []).map(value => value.replace(/^\ufeff/, ''));
const encode = (values: string[]) => values.map(v => `"${v.replace(/"/g, '""')}"`).join(',');
const identity = (t: StatementTransactionInput) => JSON.stringify([t.transactionDate, t.description, t.amount.replace(/^0+(?=\d)/, '').replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1'), t.type, t.reference ?? '']);
export function previewMappedStatement(csv: string, mapping: StatementMapping, existing: StatementTransactionInput[] = []) {
  const all = rows(csv); const headers = statementCsvColumns(csv);
  if (!mapping.date || !mapping.description || (!mapping.amount && !mapping.debit && !mapping.credit)) throw new Error('Map date, description, and amount or debit/credit columns.');
  const at = (row: string[], field?: string) => field ? row[headers.indexOf(field)] ?? '' : '';
  const seen = new Set(existing.map(identity)); const valid: StatementTransactionInput[] = []; const errors: { row: number; message: string }[] = []; const duplicates: number[] = [];
  all.slice(1).forEach((row, i) => {
    try {
      let date = at(row, mapping.date);
      if (mapping.dateFormat === 'DD/MM/YYYY' && /^\d{2}\/\d{2}\/\d{4}$/.test(date)) { const [d,m,y] = date.split('/'); date = `${y}-${m}-${d}`; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T00:00:00Z`).toISOString().slice(0,10) !== date) throw new Error('Choose a valid date; expected the selected date format.');
      if (!mapping.amount && at(row, mapping.debit).trim() && at(row, mapping.credit).trim() && /[1-9]/.test(at(row, mapping.debit)) && /[1-9]/.test(at(row, mapping.credit))) throw new Error('Both debit and credit are populated; review the source row.');
      const names = ['Date', 'Description', ...(mapping.amount ? ['Amount'] : ['Debit', 'Credit']), 'Reference'];
      const values = [date, at(row, mapping.description), ...(mapping.amount ? [at(row, mapping.amount)] : [at(row, mapping.debit), at(row, mapping.credit)]), at(row, mapping.reference)];
      const value = parseBankStatementCsv(`${encode(names)}\n${encode(values)}`)[0];
      if (seen.has(identity(value))) duplicates.push(i + 2); seen.add(identity(value)); valid.push(value);
    } catch (error) { errors.push({ row: i + 2, message: error instanceof Error ? error.message : 'Invalid transaction.' }); }
  });
  return { valid, errors, duplicates };
}
