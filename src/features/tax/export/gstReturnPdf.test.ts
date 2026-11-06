import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaxReturn } from '@/types/payment';
import { downloadGstReturnPdf } from './gstReturnPdf';

const pdf = vi.hoisted(() => ({
  text: vi.fn(),
  setFont: vi.fn(),
  setFontSize: vi.fn(),
  setTextColor: vi.fn(),
  line: vi.fn(),
  save: vi.fn().mockResolvedValue(undefined),
  setProperties: vi.fn(),
  addPage: vi.fn(),
  splitTextToSize: vi.fn((value: string) => [value]),
}));

vi.mock('jspdf', () => ({ jsPDF: vi.fn(function () { return pdf; }) }));

describe('GST return PDF export', () => {
  beforeEach(() => vi.clearAllMocks());

  it('downloads a filing copy containing the period, figures, status and IRD reference', async () => {
    const taxReturn: TaxReturn = {
      id: 'return-1',
      userId: '',
      periodStart: '2026-07-01',
      periodEnd: '2026-09-30',
      returnType: 'GST',
      totalSales: 1150,
      totalPurchases: 230,
      gstOnSales: 150,
      gstOnPurchases: 30,
      netGst: 120,
      status: 'submitted',
      submittedAt: '2026-10-03T01:00:00.000Z',
      irdReference: 'GST-2026-12345',
      createdAt: '2026-10-03T00:00:00.000Z',
      updatedAt: '2026-10-03T01:00:00.000Z',
      returnData: { preparation: { basis: 'invoice', baseCurrency: 'NZD', dueDate: '2026-10-28' } },
    };

    await downloadGstReturnPdf(taxReturn);

    const writtenText = pdf.text.mock.calls.flatMap((call) => call[0]).join(' ');
    expect(writtenText).toContain('GST-2026-12345');
    expect(writtenText).toContain('$1,150.00');
    expect(writtenText).toContain('$120.00 to pay');
    expect(writtenText).toContain('Confirmed due date');
    expect(writtenText).toContain('28 Oct 2026');
    expect(pdf.save).toHaveBeenCalledWith('GST-Return-2026-07-01-to-2026-09-30.pdf', {
      returnPromise: true,
    });
  });
});

it('labels a payments-basis draft correctly in the exported filing copy', async () => {
  await downloadGstReturnPdf({ id: 'payments', userId: '', periodStart: '2026-04-01', periodEnd: '2026-04-30', returnType: 'GST', totalSales: 1380, totalPurchases: 349, gstOnSales: 180, gstOnPurchases: 39, netGst: 141, status: 'draft', createdAt: '', updatedAt: '', returnData: { preparation: { basis: 'payments', baseCurrency: 'NZD', dueDate: '2026-05-28' } } });
  expect(pdf.text.mock.calls.flatMap((call) => call[0]).join(' ')).toContain('Payments basis · NZD');
});

it('exports canonical string figures without losing cents and labels the original hybrid basis', async () => {
  pdf.text.mockClear();
  await downloadGstReturnPdf({ id: 'hybrid', periodStart: '2026-04-01', periodEnd: '2026-05-31', returnType: 'GST', totalSales: '9007199254740993.15', totalPurchases: '0.00', gstOnSales: '15.00', gstOnPurchases: '0.00', netGst: '15.00', status: 'draft', createdAt: '', updatedAt: '', returnData: { preparation: { basis: 'hybrid', baseCurrency: 'NZD', dueDate: '2026-06-29' } } } as never);
  const text = pdf.text.mock.calls.flatMap(call => call[0]).join(' ');
  expect(text).toContain('$9,007,199,254,740,993.15');
  expect(text).toContain('Hybrid basis · NZD');
});

it('keeps incomplete myIR mapping warnings in the downloaded record instead of implying missing boxes are zero', async () => {
  pdf.text.mockClear();
  await downloadGstReturnPdf({ id: 'review', periodStart: '2026-04-01', periodEnd: '2026-04-30', returnType: 'GST', totalSales: '100.00', totalPurchases: '50.00', gstOnSales: '0.00', gstOnPurchases: '0.00', netGst: '0.00', status: 'draft', returnData: { gstCalculation: { version: 'gst-ledger-v2', sourceCounts: {}, myIrBoxes: { '5': '100.00' }, mappingStatus: 'requires_confirmation', warnings: ['Box 11 needs confirmation from purchase records.'] } } } as never);
  const text = pdf.text.mock.calls.flatMap(call => call[0]).join(' ');
  expect(text).toContain('Mapping requires confirmation');
  expect(text).toContain('Box 11 needs confirmation');
});
