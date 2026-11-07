import { statementCsvColumns, previewMappedStatement } from './statementMapping';
describe('mapped statement preview', () => {
  it('allows bank-specific column mapping and retains exact decimal strings', () => {
    const csv = 'Posted,Memo,Value\n31/10/2026,Shop,-9007199254740993.01\n2026-10-31,Other,12.10';
    expect(statementCsvColumns(csv)).toEqual(['Posted', 'Memo', 'Value']);
    const preview = previewMappedStatement(csv, { date: 'Posted', description: 'Memo', amount: 'Value', dateFormat: 'DD/MM/YYYY' });
    expect(preview.valid[0]).toMatchObject({ transactionDate: '2026-10-31', amount: '9007199254740993.01', type: 'debit' });
    expect(preview.valid[1].amount).toBe('12.10');
  });
  it('reports invalid rows and duplicates before apply without discarding good rows', () => {
    const csv = 'Date,Description,Amount\n2026-02-30,Invalid,20\n2026-10-01,Coffee,-5.10\n2026-10-01,Coffee,-5.10';
    const result = previewMappedStatement(csv, { date: 'Date', description: 'Description', amount: 'Amount', dateFormat: 'YYYY-MM-DD' }, [{ transactionDate: '2026-10-01', description: 'Coffee', amount: '5.10', type: 'debit' }]);
    expect(result.errors).toEqual([expect.objectContaining({ row: 2 })]);
    expect(result.duplicates).toEqual([3, 4]);
    expect(result.valid).toHaveLength(2);
  });
});

it('rejects rows with both debit and credit instead of silently dropping one amount', () => {
  const csv = 'Date,Description,Debit,Credit\n2026-10-01,Ambiguous,5.10,6.20';
  const result = previewMappedStatement(csv, { date: 'Date', description: 'Description', amount: '', debit: 'Debit', credit: 'Credit', dateFormat: 'YYYY-MM-DD' });
  expect(result.valid).toHaveLength(0);
  expect(result.errors[0].message).toMatch(/both debit and credit/i);
});
