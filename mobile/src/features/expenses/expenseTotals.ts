import { computeInvoiceTotals } from '../../../../api/src/modules/invoices/totals';
import { decimal, roundMoney } from '../../../../api/src/modules/invoices/money';

/** The form accepts a net cost; the expense API stores the gross amount paid. */
export function expenseTotals(net: string, taxEnabled: boolean, taxRate: number) {
  const valid = /^\d+(\.\d{0,2})?$/.test(net.trim());
  const totals = computeInvoiceTotals({
    items: [{ description: 'Expense', quantity: '1', unit: 'ea', rate: valid ? net : '0', rateUnit: 'ea' }],
    taxInclusive: false,
    taxRate: taxEnabled ? String(taxRate) : '0',
  }, '0');
  return { net: totals.subtotal, tax: totals.taxAmount, gross: totals.total, valid: valid && decimal(net).compare(0) > 0 };
}

export function expenseNet(gross: number, tax: number) {
  return roundMoney(decimal(String(gross)).sub(String(tax)));
}

export function expenseTaxRate(gross: number, tax: number) {
  const net = expenseNet(gross, tax);
  // Rounded GST on small NZ costs can imply an artificial effective rate.
  if (tax > 0 && expenseTotals(net, true, 15).tax === roundMoney(String(tax))) return 15;
  return decimal(net).compare(0) > 0 ? Number(decimal(String(tax)).div(net).mul(100).toFixed(6)) : 15;
}
