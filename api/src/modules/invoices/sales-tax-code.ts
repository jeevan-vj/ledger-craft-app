import type { SalesTaxCode } from '@ledgercraft/contracts';
import { apiError } from '../../http-error';
import { decimal } from './money';

type CodedLine = {
  taxCode?: SalesTaxCode | null;
  taxes: Array<{ rate: string }>;
  tax: string;
};

/** GST-bearing 15% lines default to standard GST. A 0% line stays unclassified until a code is sent. */
export function resolveSalesTaxCode(input: CodedLine): SalesTaxCode | null {
  const rate = input.taxes.reduce((sum, tax) => sum.add(decimal(tax.rate)), decimal(0));
  const carriesGst = decimal(input.tax).compare(0) > 0 || rate.compare(0) > 0;
  const code = input.taxCode ?? null;
  if (code === 'standard_15') {
    if (rate.compare('15') !== 0) throw apiError(422, 'SALES_TAX_CODE_MISMATCH', 'Standard GST (15%) only applies to a line whose GST rate is 15%.');
    return 'standard_15';
  }
  if (code === 'zero_rated' || code === 'exempt') {
    if (carriesGst) throw apiError(422, 'SALES_TAX_CODE_MISMATCH', 'Zero-rated and exempt lines cannot carry GST.');
    return code;
  }
  if (rate.compare('15') === 0) return 'standard_15';
  return null;
}

export function withSalesTaxCodes<T extends { lines: CodedLine[] }>(
  totals: T,
  items: Array<{ taxCode?: SalesTaxCode | null }>,
): T {
  return {
    ...totals,
    lines: totals.lines.map((line, index) => {
      const taxCode = resolveSalesTaxCode({ ...line, taxCode: items[index]?.taxCode });
      return taxCode ? { ...line, taxCode } : { ...line, taxCode: null };
    }),
  };
}
