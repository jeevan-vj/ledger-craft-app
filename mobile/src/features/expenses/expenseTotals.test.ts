import { expenseNet, expenseTaxRate, expenseTotals } from './expenseTotals';

it('rounds GST and the gross payment with the shared invoice pricing policy', () => {
  expect(expenseTotals('0.10', true, 15)).toMatchObject({ net: '0.10', tax: '0.02', gross: '0.12' });
  expect(expenseTotals('50', false, 15)).toMatchObject({ net: '50.00', tax: '0.00', gross: '50.00' });
});

it.each(['', '0', '-1', '1x', 'Infinity', '1.234'])('rejects invalid money %s before creating an expense', (value) => {
  expect(expenseTotals(value, true, 15).valid).toBe(false);
});

it('loads an existing gross expense without adding GST twice on save', () => {
  expect(expenseNet(230, 30)).toBe('200.00');
  expect(expenseTaxRate(230, 30)).toBe(15);
  expect(expenseTaxRate(120, 20)).toBe(20);
  expect(expenseTaxRate(0.12, 0.02)).toBe(15);
});
