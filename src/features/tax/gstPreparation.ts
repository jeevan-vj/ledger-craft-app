import { readApiFailure } from '@/lib/api/readApiError';
import { gstPreparationResponseSchema } from '@ledgercraft/contracts';
import { decimal, roundMoney } from '../../../api/src/modules/invoices/money';

export interface GstPreparation {
  basis: 'invoice';
  totalSales: number;
  totalPurchases: number;
  gstOnSales: number;
  gstOnPurchases: number;
  netGstPosition: number;
  warnings: string[];
}

/** Server-selected eligible documents and posted invoice-basis GST, in exact strings. */
export async function loadGstPreparation(from: string, to: string): Promise<GstPreparation> {
  const query = new URLSearchParams({ from, to });
  const response = await fetch(`/api/tax/gst-preparation?${query}`, { credentials: 'include' });
  if (!response.ok) {
    const failure = await readApiFailure(response);
    throw new Error(failure.message);
  }
  const figures = gstPreparationResponseSchema.parse(await response.json());
  if (figures.basis !== 'invoice') throw new Error('Unsupported GST preparation basis');
  // Existing UI/snapshot types use numbers; convert only at the presentation boundary.
  return { basis: figures.basis, totalSales: Number(figures.totalSales), totalPurchases: Number(figures.totalPurchases),
    gstOnSales: Number(figures.gstOnSales), gstOnPurchases: Number(figures.gstOnPurchases),
    netGstPosition: Number(figures.netGstPosition), warnings: figures.warnings };
}

export function netGstAfterAdjustments(output: number, input: number, ...adjustments: number[]): number {
  return Number(roundMoney(adjustments.reduce((amount, adjustment) => amount.sub(String(adjustment)), decimal(String(output)).sub(String(input)))));
}
