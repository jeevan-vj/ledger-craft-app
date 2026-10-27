import type { CreateSaleRequest } from '@ledgercraft/contracts';
import { onlineManager } from '@tanstack/react-query';
import { apiRequest, AuthApiError } from '@/features/auth/api/http';
import { OFFLINE_SALE_MESSAGE } from './saleAttempt';

export interface SaleResult {
  invoice: { id: string; invoiceNumber: string; total: string; status: string };
  payment: { id: string; amount: string; paymentMethod: string; status: string };
  receipt: { id: string };
}

/**
 * Receipt-sheet handoff for PR D.
 * PR D replaces the success state with the QR and share sheet and creates the
 * invoice share link only when that sheet opens. This slice does not.
 */
export interface SaleReceiptHandoff {
  invoiceId: string;
  invoiceNumber: string;
  paymentId: string;
  receiptId: string;
}

export function saleReceiptHandoff(result: SaleResult): SaleReceiptHandoff {
  return {
    invoiceId: result.invoice.id,
    invoiceNumber: result.invoice.invoiceNumber,
    paymentId: result.payment.id,
    receiptId: result.receipt.id,
  };
}

export async function createSale(body: CreateSaleRequest, idempotencyKey: string): Promise<SaleResult> {
  if (!onlineManager.isOnline()) {
    throw new AuthApiError(OFFLINE_SALE_MESSAGE, 0, 'OFFLINE');
  }
  return apiRequest<SaleResult>('/api/sales', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(body),
  });
}
