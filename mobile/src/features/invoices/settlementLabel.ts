import type { Invoice } from '@/types/invoice';
import { getStatusLabel } from '@/utils/statusUtils';

export function invoiceSettlementLabel(invoice: Pick<Invoice, 'status' | 'balanceDueText' | 'totalCreditedText' | 'totalPaidText'>): string {
  const hasCredit = /[1-9]/.test(invoice.totalCreditedText ?? '0');
  const fullySettled = invoice.balanceDueText !== undefined && !/[1-9]/.test(invoice.balanceDueText);
  if (hasCredit && fullySettled) return /[1-9]/.test(invoice.totalPaidText ?? '0') ? 'Settled' : 'Credited';
  return getStatusLabel(invoice.status);
}
