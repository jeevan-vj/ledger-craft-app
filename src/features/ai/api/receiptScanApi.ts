import type { ReceiptScanResultDto } from '@ledgercraft/contracts';
import { readApiFailure } from '@/lib/api/readApiError';
import type { ReceiptScanResult } from '@/types/receipt';

export function aiApiEnabled(): boolean {
  return import.meta.env.VITE_AI_API === 'true';
}

export class ReceiptScanApiError extends Error {
  readonly requestId?: string;

  constructor(
    message: string,
    readonly status: number,
    requestId?: string,
  ) {
    super(message);
    this.name = 'ReceiptScanApiError';
    this.requestId = requestId;
  }
}

export async function scanReceiptImage(imageBase64: string, contentType?: string): Promise<ReceiptScanResult> {
  const response = await fetch('/api/ai/receipt-scan', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, contentType, exactAmounts: true }),
  });
  if (!response.ok) {
    const failure = await readApiFailure(response);
    throw new ReceiptScanApiError(failure.message, failure.status, failure.requestId);
  }
  const result = (await response.json()) as ReceiptScanResultDto;
  return {
    merchantName: result.merchantName ?? null, date: result.date ?? null,
    total: result.total ?? null, tax: result.tax ?? null, subtotal: result.subtotal ?? null,
    items: (result.items ?? []).map((item) => ({ description: item.description ?? '', quantity: item.quantity ?? '1', price: item.price ?? '0.00' })),
    paymentMethod: result.paymentMethod ?? null, suggestedCategory: result.suggestedCategory ?? null,
    confidence: result.confidence ?? 0, notes: result.notes ?? null, provider: result.provider,
  };
}
