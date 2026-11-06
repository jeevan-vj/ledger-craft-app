import { decimal } from '../../../api/src/modules/invoices/money';

/** Cash and credit-note settlement must remain distinct on customer documents. */
export function settlementLabel(value: { status?: unknown; paymentStatus?: unknown; totalPaid?: unknown; totalCredited?: unknown }): string | undefined {
  if (value.status !== 'paid' && value.paymentStatus !== 'paid') return undefined;
  const amount = (raw: unknown) => typeof raw === 'string' || typeof raw === 'number' ? String(raw) : '0';
  const credits = amount(value.totalCredited);
  if (/^\d+(?:\.\d+)?$/.test(credits) && decimal(credits).compare(0) > 0) {
    const paid = amount(value.totalPaid);
    return /^\d+(?:\.\d+)?$/.test(paid) && decimal(paid).compare(0) > 0 ? 'Settled with credits' : 'Credited';
  }
  return 'Paid';
}
