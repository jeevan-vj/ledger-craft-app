import { Decimal } from 'decimal.js';

type Buyer = { name?: string | null; email?: string | null; phone?: string | null; address?: string | null; nzbn?: string | null; website?: string | null };
/** Preview/save validation only. Stored totals and final enforcement belong to Hono. */
export function invoiceBuyerFix(total: string | number, currency: string, registration: string | undefined, buyer?: Buyer | null, baseTotal?: string | null): string | undefined {
  if (registration !== 'registered' || (currency.toUpperCase() !== 'NZD' && baseTotal == null)) return;
  const nzdTotal = currency.toUpperCase() === 'NZD' ? total : baseTotal!;
  let overThreshold = false;
  try { overThreshold = new Decimal(String(nzdTotal)).greaterThan('1000.00'); } catch { return 'Review the invoice total before saving.'; }
  if (!overThreshold) return;
  if (!buyer?.name?.trim()) return 'Add the buyer name before saving this tax invoice over NZ$1,000.';
  if (![buyer.email, buyer.phone, buyer.address, buyer.nzbn, buyer.website].some(value => value?.trim())) {
    return 'Add a buyer identifier (email, phone, address, NZBN or website) before saving this tax invoice over NZ$1,000. Edit the customer, then select it again.';
  }
}
