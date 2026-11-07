import { ReceiptScanResult, ReceiptScanOptions } from '@/types/receipt';
import { scanReceiptImage } from '@/features/ai/api/receiptScanApi';
import { getServerCapabilities } from './capabilitiesService';
export class ReceiptScanError extends Error {
 constructor({ code, message }: { code: 'PROCESSING_ERROR' | 'INVALID_IMAGE' | 'API_ERROR' | 'NETWORK_ERROR'; message: string }) { super(message); this.name = 'ReceiptScanError'; this.code = code; }
 readonly code: 'PROCESSING_ERROR' | 'INVALID_IMAGE' | 'API_ERROR' | 'NETWORK_ERROR';
}
export class OpenAIReceiptService {
 async isAvailable(): Promise<boolean> { return (await getServerCapabilities()).ai === 'available'; }
 async scanReceipt(imageBase64: string, _options: ReceiptScanOptions = {}): Promise<ReceiptScanResult> {
  try { return await scanReceiptImage(imageBase64); } catch (error) { throw new ReceiptScanError({ code: 'API_ERROR', message: error instanceof Error ? error.message : "Couldn't read this receipt" }); }
 }
 static async uriToBase64(uri: string): Promise<string> { const response = await fetch(uri); const blob = await response.blob(); return new Promise((resolve,reject)=>{ const reader = new FileReader(); reader.onloadend=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('Could not read receipt'));reader.readAsDataURL(blob); }); }
 static async compressImage(uri: string, _maxWidth = 1024, _quality = 0.8): Promise<string> { return this.uriToBase64(uri); }
}
export const openaiReceiptService = new OpenAIReceiptService();
