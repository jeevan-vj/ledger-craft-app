import { computeInvoiceTotals } from '../../../../api/src/modules/invoices/totals';
import type { LineItem } from '@/types/invoice';
import type { QuoteCharge } from '@/types/quote';
import { decimalText } from '@/features/quotes/quoteModel';

export interface QuotePreviewInput {
  items: LineItem[];
  taxInclusive: boolean;
  taxEnabled: boolean;
  taxRate: number;
  discountType: 'fixed' | 'percent';
  discountValue: string;
  additionalCharges: string;
  additionalChargesList?: QuoteCharge[];
  defaultTaxRate?: string | number;
}

export interface QuotePreviewTotals {
  subtotal: string;
  taxAmount: string;
  discount: string | null;
  additionalCharges: string | null;
  total: string;
  taxInclusive: boolean;
  lines: Array<{ description: string; quantity: string; rate: string; tax: string; total: string }>;
  error: string | null;
}

const EMPTY_PREVIEW: Omit<QuotePreviewTotals, 'taxInclusive' | 'error'> = {
  subtotal: '0.00',
  taxAmount: '0.00',
  discount: null,
  additionalCharges: null,
  total: '0.00',
  lines: [],
};

/** Preview with the API's computeInvoiceTotals. The saved quote is priced by that same function. */
export function previewQuoteTotals(input: QuotePreviewInput): QuotePreviewTotals {
  const items = input.items
    .filter((item) => item.description.trim())
    .map((item) => ({
      description: item.description.trim(),
      quantity: decimalText(item.quantity),
      unit: item.unit || 'ea',
      rate: decimalText(item.rate),
      rateUnit: item.unit || 'ea',
    }));
  const discountValue = input.discountValue.trim();
  const charges = input.additionalCharges.trim();
  try {
    const totals = computeInvoiceTotals(
      {
        items,
        taxInclusive: input.taxInclusive,
        taxRate: input.taxEnabled ? decimalText(input.taxRate) : '0',
        discountType: input.discountType,
        discountPercent: input.discountType === 'percent' ? (discountValue || '0') : null,
        discount: input.discountType === 'fixed' ? (discountValue || null) : null,
        additionalCharges: charges || null,
        additionalChargesList: input.additionalChargesList,
      },
      input.defaultTaxRate ?? 0,
    );
    return {
      subtotal: totals.subtotal,
      taxAmount: totals.taxAmount,
      discount: totals.discount,
      additionalCharges: totals.additionalCharges,
      total: totals.total,
      taxInclusive: totals.taxInclusive,
      lines: totals.lines.map((line) => ({
        description: line.description,
        quantity: line.quantity,
        rate: line.rate,
        tax: line.tax,
        total: line.total,
      })),
      error: null,
    };
  } catch (error) {
    return {
      ...EMPTY_PREVIEW,
      taxInclusive: input.taxInclusive,
      error: error instanceof Error && error.message.trim()
        ? error.message
        : 'Totals could not be previewed.',
    };
  }
}
