import { ReceiptScanResult, ReceiptScanOptions } from '@/types/receipt';
import { scanReceiptImage } from '@/features/ai/api/receiptScanApi';

export class ReceiptScanError extends Error {
  public code: 'PROCESSING_ERROR' | 'INVALID_IMAGE' | 'API_ERROR' | 'NETWORK_ERROR';

  constructor({ code, message }: { code: ReceiptScanError['code']; message: string }) {
    super(message);
    this.name = 'ReceiptScanError';
    this.code = code;
  }
}

class OpenAIReceiptService {
  public isAvailable(): boolean {
    return true;
  }

  public async scanReceipt(
    imageData: string,
    _options: ReceiptScanOptions = {},
  ): Promise<ReceiptScanResult> {
    const base64Data = imageData.startsWith('data:')
      ? imageData
      : `data:image/jpeg;base64,${imageData}`;
    try {
      return await scanReceiptImage(base64Data);
    } catch (error) {
      throw new ReceiptScanError({
        code: 'API_ERROR',
        message: error instanceof Error ? error.message : 'Receipt scanning failed',
      });
    }
  }

  public static async fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result);
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  public static async compressImage(
    file: File,
    maxWidth: number = 1024,
    quality: number = 0.8,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      img.onload = () => {
        const ratio = Math.min(maxWidth / img.width, maxWidth / img.height);
        canvas.width = img.width * ratio;
        canvas.height = img.height * ratio;
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = URL.createObjectURL(file);
    });
  }
}

export { OpenAIReceiptService };
export const openaiReceiptService = new OpenAIReceiptService();
