/**
 * Display helpers for invoice and quote line items.
 * Money totals stay on the existing calculations; this module only formats text.
 */

/** Defaults that add noise when repeated beside the quantity and the price. */
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

/**
 * Quantity column: the number, plus a meaningful unit ("1 kg", "2 hrs").
 * Generic defaults ("each", "ea", "unit", "pcs") are omitted so the cell reads "15".
 */
export function formatLineQuantity(
  quantity: number | string | null | undefined,
  unit?: string | null,
): string {
  const amount = quantity == null || quantity === '' ? '' : String(quantity);
  if (amount === '' || isGenericInvoiceUnit(unit)) return amount;
  return `${amount} ${String(unit).trim()}`;
}

/**
 * True when a tax, discount, or extra-charge row should be painted.
 * Returns a boolean so `{showPositiveAmount(0) && <Row />}` cannot render a stray 0.
 */
export function showPositiveAmount(value: number | string | null | undefined): boolean {
  const amount = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(amount) && amount > 0;
}
