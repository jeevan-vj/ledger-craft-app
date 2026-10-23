export interface StatementTransactionInput {
  transactionDate: string;
  description: string;
  reference?: string | null;
  amount: string;
  type: 'debit' | 'credit';
  balance?: string | null;
  category?: string | null;
  merchant?: string | null;
}

const moneyPattern = /^-?\d+(?:\.\d+)?$/;

function csvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (character === '"') {
      if (quoted && csv[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      row.push(value.trim());
      value = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && csv[index + 1] === '\n') index += 1;
      row.push(value.trim());
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      value = '';
    } else {
      value += character;
    }
  }

  row.push(value.trim());
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  if (quoted) throw new Error('The CSV contains an unclosed quoted value.');
  return rows;
}

function normalizedHeader(value: string) {
  return value.toLowerCase().replace(/^\ufeff/, '').replace(/[\s_-]+/g, '');
}

function normalizedMoney(value: string) {
  const result = value.replace(/[,$\s]/g, '');
  if (!moneyPattern.test(result)) throw new Error(`Invalid amount “${value}”.`);
  return result;
}

export function parseBankStatementCsv(csv: string): StatementTransactionInput[] {
  const rows = csvRows(csv);
  if (rows.length < 2) throw new Error('The CSV must contain a header and at least one transaction.');

  const headers = rows[0].map(normalizedHeader);
  const column = (names: string[]) => names.map((name) => headers.indexOf(name)).find((index) => index >= 0) ?? -1;
  const dateIndex = column(['date', 'transactiondate']);
  const descriptionIndex = column(['description', 'details', 'narrative']);
  const amountIndex = column(['amount']);
  const debitIndex = column(['debit', 'withdrawal']);
  const creditIndex = column(['credit', 'deposit']);
  const typeIndex = column(['type', 'transactiontype']);
  const referenceIndex = column(['reference', 'ref']);
  const balanceIndex = column(['balance', 'runningbalance']);

  if (dateIndex < 0 || descriptionIndex < 0 || (amountIndex < 0 && debitIndex < 0 && creditIndex < 0)) {
    throw new Error('CSV headers must include Date, Description, and Amount (or Debit/Credit).');
  }

  return rows.slice(1).map((row, rowIndex) => {
    const transactionDate = row[dateIndex]?.trim();
    const description = row[descriptionIndex]?.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(transactionDate || '')) throw new Error(`Row ${rowIndex + 2} has an invalid date. Use YYYY-MM-DD.`);
    if (!description) throw new Error(`Row ${rowIndex + 2} needs a description.`);

    const debit = debitIndex >= 0 && row[debitIndex] ? normalizedMoney(row[debitIndex]) : '';
    const credit = creditIndex >= 0 && row[creditIndex] ? normalizedMoney(row[creditIndex]) : '';
    let amount = amountIndex >= 0 ? normalizedMoney(row[amountIndex] || '') : debit || credit;
    const declaredType = typeIndex >= 0 ? row[typeIndex]?.trim().toLowerCase() : '';
    let type: 'debit' | 'credit';
    if (declaredType === 'debit' || declaredType === 'credit') type = declaredType;
    else if (debit) type = 'debit';
    else if (credit) type = 'credit';
    else type = amount.startsWith('-') ? 'debit' : 'credit';
    if (amount.startsWith('-')) amount = amount.slice(1);
    if (/^0+(?:\.0+)?$/.test(amount)) throw new Error(`Row ${rowIndex + 2} must have a non-zero amount.`);

    return {
      transactionDate,
      description,
      amount,
      type,
      reference: referenceIndex >= 0 ? row[referenceIndex]?.trim() || null : null,
      balance: balanceIndex >= 0 && row[balanceIndex] ? normalizedMoney(row[balanceIndex]) : null,
    };
  });
}
