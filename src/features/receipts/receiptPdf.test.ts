import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Receipt } from '@/types/payment';
import { downloadReceiptPdf } from './receiptPdf';

const { save } = vi.hoisted(() => ({ save: vi.fn() }));

vi.mock('jspdf', () => ({
  jsPDF: class {
    setFont = vi.fn();
    setFontSize = vi.fn();
    text = vi.fn();
    setDrawColor = vi.fn();
    line = vi.fn();
    save = save;
  },
}));

beforeEach(() => save.mockClear());

describe('receipt PDF', () => {
  it('downloads a real PDF using the receipt number', () => {
    const receipt = {
      receiptNumber: 'REC-202610-0001',
      generatedAt: '2026-10-19T00:00:00.000Z',
      receiptData: {
        invoice: { invoiceNumber: 'INV-2026-001', currency: 'NZD' },
        customer: { name: 'Kauri Studio' },
        paymentDate: '2026-10-19',
        paymentMethod: 'Bank Transfer',
        amountPaid: 115,
        balanceAfterPayment: 0,
      },
    } as Receipt;

    downloadReceiptPdf(receipt);

    expect(save).toHaveBeenCalledWith('Receipt-REC-202610-0001.pdf');
  });
});
