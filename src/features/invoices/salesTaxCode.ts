import type { LineItem } from '@/types';

export type SalesTaxCode = 'standard_15' | 'zero_rated' | 'exempt';

export const salesTaxCodeOptions: Array<{ value: SalesTaxCode; label: string }> = [
  { value: 'standard_15', label: 'GST 15%' },
  { value: 'zero_rated', label: 'Zero-rated' },
  { value: 'exempt', label: 'Exempt' },
];

export function lineCarriesGst(item: Pick<LineItem, 'taxes'>, taxEnabled: boolean): boolean {
  if (item.taxes) return item.taxes.some((tax) => tax.rate > 0);
  return taxEnabled;
}

/** Blank means a 0% line still needs an explicit zero-rated or exempt choice. */
export function lineSalesTaxCode(item: Pick<LineItem, 'taxCode' | 'taxes'>, taxEnabled: boolean): SalesTaxCode | '' {
  if (!lineCarriesGst(item, taxEnabled)) {
    return item.taxCode === 'zero_rated' || item.taxCode === 'exempt' ? item.taxCode : '';
  }
  return 'standard_15';
}

export function applySalesTaxCode(item: LineItem, code: SalesTaxCode): LineItem {
  if (code === 'standard_15') {
    const { taxes: _taxes, ...rest } = item;
    return { ...rest, taxCode: 'standard_15' };
  }
  return { ...item, taxCode: code, taxes: [] };
}
