import { parseBankStatementCsv } from './statementImport';

describe('parseBankStatementCsv', () => {
  it('preserves exact amounts and quoted descriptions', () => {
    expect(parseBankStatementCsv('Date,Description,Amount,Type,Reference\n2026-10-22,"Coffee, team",9007199254740993.01,debit,CARD-1')).toEqual([
      { transactionDate: '2026-10-22', description: 'Coffee, team', amount: '9007199254740993.01', type: 'debit', reference: 'CARD-1', balance: null },
    ]);
  });

  it('supports separate debit and credit columns', () => {
    expect(parseBankStatementCsv('Transaction Date,Narrative,Debit,Credit,Balance\n2026-10-20,Subscription,12.30,,100.20\n2026-10-21,Payment,,50.00,150.20')).toEqual([
      expect.objectContaining({ amount: '12.30', type: 'debit', balance: '100.20' }),
      expect.objectContaining({ amount: '50.00', type: 'credit', balance: '150.20' }),
    ]);
  });

  it('reports the row for invalid dates', () => {
    expect(() => parseBankStatementCsv('Date,Description,Amount\n22/10/2026,Coffee,-5.00')).toThrow('Row 2 has an invalid date');
  });
});
