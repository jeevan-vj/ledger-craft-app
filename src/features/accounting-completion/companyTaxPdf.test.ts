import { expect, it, vi } from 'vitest';
import { downloadCompanyTaxPdf } from './companyTaxPdf';
const pdf = vi.hoisted(() => ({ text: vi.fn(), setFont: vi.fn(), setFontSize: vi.fn(), addPage: vi.fn(), save: vi.fn().mockResolvedValue(undefined), setProperties: vi.fn(), splitTextToSize: vi.fn((value: string) => [value]) }));
vi.mock('jspdf', () => ({ jsPDF: vi.fn(function () { return pdf; }) }));
it('exports the saved company worksheet with exact payable146 and accountant review boundary', async () => {
  await downloadCompanyTaxPdf({ from: '2026-04-01', to: '2027-03-31', entityType: 'nz_company', baseCurrency: 'NZD', taxRate: '28', accountingProfit: '850.00', addBacks: '100.00', deductions: '50.00', taxAdjustedProfit: '900.00', lossesApplied: '200.00', lossesCarriedForward: '0.00', taxableIncome: '700.00', incomeTax: '196.00', taxCredits: '50.00', incomeTaxPayable: '146.00', excessCredits: '0.00', adjustments: [{ kind: 'add_back', amount: '100.00', reason: 'Non deductible entertainment', sourceReference: 'RECEIPT-1' }], lossesBroughtForward: '200.00', preparedAt: '2026-11-06T00:00:00.000Z', preparedBy: 'owner', warnings: ['Accountant review required'] });
  const text = pdf.text.mock.calls.flatMap((call) => call[0]).join(' ');
  expect(text).toContain('NZD 146.00'); expect(text).toContain('NZD 700.00'); expect(text).toContain('RECEIPT-1');
  expect(text).toContain('not an IR4 return'); expect(text).not.toContain('GST return');
  expect(pdf.save).toHaveBeenCalledWith('Company-Tax-Worksheet-2026-04-01-to-2027-03-31.pdf', { returnPromise: true });
});
