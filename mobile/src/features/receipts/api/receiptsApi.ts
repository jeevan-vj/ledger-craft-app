import { apiRequest } from '@/features/auth/api/http';
import type { Receipt } from '@/types/payment';

export function receiptsApiEnabled(): boolean {
  return process.env.EXPO_PUBLIC_RECEIPTS_API === 'true';
}

interface PaymentReceiptDto {
  id: string;
  paymentId: string;
  receiptNumber: string;
  generatedAt: string;
  emailSentAt: string | null;
  isEmailed: boolean;
  createdAt: string;
}

function toReceipt(dto: PaymentReceiptDto): Receipt {
  return {
    id: dto.id,
    paymentId: dto.paymentId,
    receiptNumber: dto.receiptNumber,
    userId: '',
    generatedAt: dto.generatedAt,
    emailSentAt: dto.emailSentAt ?? undefined,
    isEmailed: dto.isEmailed,
    receiptData: null,
    createdAt: dto.createdAt,
  };
}

export const receiptsApi = {
  async list(): Promise<Receipt[]> {
    const body = await apiRequest<{ receipts: PaymentReceiptDto[] }>('/api/receipts');
    return body.receipts.map(toReceipt);
  },

  async create(paymentId: string): Promise<Receipt> {
    return toReceipt(
      await apiRequest<PaymentReceiptDto>('/api/receipts', {
        method: 'POST',
        body: JSON.stringify({ paymentId }),
      }),
    );
  },
};
