/**
 * Display helpers for invoice and quote line items.
 * Kept in step with src/utils/invoiceLineDisplay.ts. Money totals are unchanged.
 */

const GENERIC_INVOICE_UNITS = new Set([
  'each',
  'ea',
  'unit',
  'units',
  'pc',
  'pcs',
  'piece',
  'pieces',
]);

export function isGenericInvoiceUnit(unit: string | null | undefined): boolean {
  const normalized = String(unit ?? '').trim().toLowerCase();
  return normalized.length === 0 || GENERIC_INVOICE_UNITS.has(normalized);
}

/** Quantity column: "1 kg" or "2 hrs", and "15" when the unit is a generic default. */
export function formatLineQuantity(
  quantity: number | string | null | undefined,
  unit?: string | null,
): string {
  const amount = quantity == null || quantity === '' ? '' : String(quantity);
  if (amount === '' || isGenericInvoiceUnit(unit)) return amount;
  return `${amount} ${String(unit).trim()}`;
}

/** Boolean gate for tax, discount, and extra-charge rows. Zero never becomes a text node. */
export function showPositiveAmount(value: number | string | null | undefined): boolean {
  const amount = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(amount) && amount > 0;
}
