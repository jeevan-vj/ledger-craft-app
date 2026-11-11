import { decimal, roundMoney } from '../invoices/money';

export type SupplyBuckets = { zeroRated: string; exempt: string; unclassified: string };
export const ZERO_SUPPLY: SupplyBuckets = { zeroRated: '0.00', exempt: '0.00', unclassified: '0.00' };

type SalesLine = { tax: string | null; total: string; taxCode: string | null };
type SalesSource = {
  baseTotal: string;
  exchangeRate: string;
  discount: string | null;
  additionalCharges: string | null;
  taxAmount: string;
};

function hasAdjustment(source: SalesSource): boolean {
  return decimal(source.discount ?? '0').compare(0) !== 0 || decimal(source.additionalCharges ?? '0').compare(0) !== 0;
}

const BUCKET_KEYS = ['zeroRated', 'exempt', 'unclassified'] as const;

/** Keep a split of one allocated amount exact. The largest bucket absorbs the rounding cent. */
export function plugLargestBucket(parts: SupplyBuckets, total: string): SupplyBuckets {
  let largest: typeof BUCKET_KEYS[number] = 'zeroRated';
  for (const key of BUCKET_KEYS) {
    if (decimal(parts[key]).abs().compare(decimal(parts[largest]).abs()) > 0) largest = key;
  }
  const others = BUCKET_KEYS.filter((key) => key !== largest).reduce((sum, key) => sum.add(parts[key]), decimal(0));
  return { ...parts, [largest]: roundMoney(decimal(total).sub(others)) };
}

function supplyKind(line: SalesLine): 'standard_15' | 'zero_rated' | 'exempt' | 'unclassified' | 'bad' {
  if (line.taxCode === 'standard_15') return 'standard_15';
  const tax = decimal(line.tax ?? '0');
  if (line.taxCode === 'zero_rated' || line.taxCode === 'exempt') return tax.compare(0) === 0 ? line.taxCode : 'bad';
  if (line.taxCode == null || line.taxCode === '' || line.taxCode === 'unclassified') return 'unclassified';
  return 'bad';
}

function whole(code: 'zero_rated' | 'exempt' | 'unclassified', amount: string): SupplyBuckets {
  const rounded = roundMoney(amount);
  if (code === 'zero_rated') return { zeroRated: rounded, exempt: '0.00', unclassified: '0.00' };
  if (code === 'exempt') return { zeroRated: '0.00', exempt: rounded, unclassified: '0.00' };
  return { zeroRated: '0.00', exempt: '0.00', unclassified: rounded };
}

function sumLines(lines: SalesLine[], exchangeRate: string): SupplyBuckets | 'nonstandard' {
  let zeroRated = decimal(0);
  let exempt = decimal(0);
  let unclassified = decimal(0);
  for (const line of lines) {
    const amount = decimal(line.total).mul(exchangeRate);
    const kind = supplyKind(line);
    if (kind === 'zero_rated') zeroRated = zeroRated.add(amount);
    else if (kind === 'exempt') exempt = exempt.add(amount);
    else if (kind === 'unclassified') unclassified = unclassified.add(amount);
    else if (kind === 'bad') return 'nonstandard';
  }
  return { zeroRated: roundMoney(zeroRated), exempt: roundMoney(exempt), unclassified: roundMoney(unclassified) };
}

/**
 * Split an invoice's untaxed gross into zero-rated, exempt and still-unclassified supplies.
 * A single code keeps the posted base total, including a document discount.
 * Mixed codes with a discount or extra charge are unsupported: the cents cannot be split safely.
 */
export function supplyBucketsForInvoice(source: SalesSource, lines: SalesLine[]): SupplyBuckets | 'unsupported' | 'nonstandard' {
  const untaxedDocument = decimal(source.taxAmount).compare(0) === 0;
  if (untaxedDocument && lines.length === 0) return whole('unclassified', source.baseTotal);
  const relevant = untaxedDocument ? lines : lines.filter((line) => decimal(line.tax ?? '0').compare(0) === 0);
  if (!untaxedDocument && relevant.length === 0) return { ...ZERO_SUPPLY };
  if (relevant.some((line) => supplyKind(line) === 'bad')) return 'nonstandard';
  const kinds = new Set(relevant.map(supplyKind));
  if (kinds.size === 1) {
    const only = [...kinds][0];
    if (only === 'standard_15') return { ...ZERO_SUPPLY };
    if (untaxedDocument && (only === 'zero_rated' || only === 'exempt' || only === 'unclassified')) return whole(only, source.baseTotal);
  }
  if (hasAdjustment(source)) return 'unsupported';
  return sumLines(relevant, source.exchangeRate);
}
