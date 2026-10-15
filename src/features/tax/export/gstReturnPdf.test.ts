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
    };

    await downloadGstReturnPdf(taxReturn);

    const writtenText = pdf.text.mock.calls.flatMap((call) => call[0]).join(' ');
    expect(writtenText).toContain('GST-2026-12345');
    expect(writtenText).toContain('$1,150.00');
    expect(writtenText).toContain('$120.00 to pay');
    expect(pdf.save).toHaveBeenCalledWith('GST-Return-2026-07-01-to-2026-09-30.pdf', {
      returnPromise: true,
    });
  });
});
