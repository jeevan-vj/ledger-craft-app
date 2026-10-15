import type { ReceiptScanResultDto } from '@ledgercraft/contracts';
import type { ReceiptScanResult } from '@/types/receipt';

export function aiApiEnabled(): boolean {
  return import.meta.env.VITE_AI_API === 'true';
}

export class ReceiptScanApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ReceiptScanApiError';
  }
}

async function parseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? response.statusText;
  } catch {
    return response.statusText;
  }
}

export async function scanReceiptImage(imageBase64: string, contentType?: string): Promise<ReceiptScanResult> {
  const response = await fetch('/api/ai/receipt-scan', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, contentType }),
  });
  if (!response.ok) {
    throw new ReceiptScanApiError(await parseError(response), response.status);
  }
  return (await response.json()) as ReceiptScanResultDto;
}
