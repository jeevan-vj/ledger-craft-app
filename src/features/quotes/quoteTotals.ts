import { computeInvoiceTotals } from '../../../api/src/modules/invoices/totals';
import type { AdditionalCharge, LineItem } from '@/types';

export interface QuotePreviewInput {
  items: LineItem[];
  taxInclusive: boolean;
  taxEnabled: boolean;
  taxRate: number;
  discountType: 'fixed' | 'percent';
  discountValue: number;
  discountPercent: number;
  additionalCharges: number;
  additionalChargesList?: AdditionalCharge[];
  defaultTaxRate?: string | number;
}

export interface QuotePreviewTotals {
  subtotal: string;
  taxAmount: string;
  discount: string | null;
  additionalCharges: string | null;
  total: string;
  taxInclusive: boolean;
}

const EMPTY_PREVIEW: Omit<QuotePreviewTotals, 'taxInclusive'> = {
  subtotal: '0.00',
  taxAmount: '0.00',
  discount: null,
  additionalCharges: null,
  total: '0.00',
};

function decimalText(value: number): string {
  return Number.isFinite(value) ? String(value) : '0';
}

/** Preview with the API's computeInvoiceTotals. The saved quote is priced by that same function. */
export function previewQuoteTotals(input: QuotePreviewInput): QuotePreviewTotals {
  const items = input.items
    .filter((item) => item.description.trim() && Number.isFinite(Number(item.quantity)) && Number.isFinite(Number(item.rate)))
    .map((item) => ({
      description: item.description.trim(),
      quantity: decimalText(Number(item.quantity)),
      unit: item.unit || 'ea',
      rate: decimalText(Number(item.rate)),
      rateUnit: item.rateUnit || item.unit || 'ea',
    }));
  try {
    const totals = computeInvoiceTotals(
      {
        items,
        taxInclusive: input.taxInclusive,
        taxRate: input.taxEnabled ? decimalText(input.taxRate) : '0',
        discountType: input.discountType,
        discountPercent: input.discountType === 'percent' ? decimalText(input.discountPercent) : null,
        discount: input.discountType === 'fixed' ? decimalText(input.discountValue) : null,
        additionalCharges: input.additionalChargesList ? null : decimalText(input.additionalCharges),
        additionalChargesList: input.additionalChargesList?.map((charge) => ({
          id: charge.id,
          type: charge.type,
          label: charge.label,
          calculationType: charge.calculationType,
          amount: decimalText(charge.amount),
          description: charge.description,
          isActive: charge.isActive,
        })),
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
    };
  } catch {
    return { ...EMPTY_PREVIEW, taxInclusive: input.taxInclusive };
  }
}
