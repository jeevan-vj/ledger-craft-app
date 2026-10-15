import { apiRequest } from '@/features/auth/api/http';
import type { ReceiptScanResult } from '@/types/receipt';

export function aiApiEnabled(): boolean {
  return process.env.EXPO_PUBLIC_AI_API === 'true';
}

export async function scanReceiptImage(imageBase64: string, contentType?: string): Promise<ReceiptScanResult> {
  return apiRequest<ReceiptScanResult>('/api/ai/receipt-scan', {
    method: 'POST',
    body: JSON.stringify({ imageBase64, contentType }),
  });
}
