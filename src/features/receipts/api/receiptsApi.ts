import type { CreatePaymentReceiptRequest, PaymentReceiptDto } from '@ledgercraft/contracts';
import type { Receipt } from '@/types/payment';

export function receiptsApiEnabled(): boolean {
  return import.meta.env.VITE_RECEIPTS_API === 'true';
}

export class ReceiptsApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ReceiptsApiError';
  }
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
    createdAt: dto.createdAt,
  };
}

async function parseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? response.statusText;
  } catch {
    return response.statusText;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (response.status === 204) return undefined as T;
  if (!response.ok) throw new ReceiptsApiError(await parseError(response), response.status);
  return (await response.json()) as T;
}

export const receiptsApi = {
  async list(): Promise<Receipt[]> {
    const body = await request<{ receipts: PaymentReceiptDto[] }>('/api/receipts');
    return body.receipts.map(toReceipt);
  },

  async get(id: string): Promise<Receipt | null> {
    try {
      return toReceipt(await request<PaymentReceiptDto>(`/api/receipts/${id}`));
    } catch (error) {
      if (error instanceof ReceiptsApiError && error.status === 404) return null;
      throw error;
    }
  },

  async create(input: CreatePaymentReceiptRequest): Promise<Receipt> {
    return toReceipt(
      await request<PaymentReceiptDto>('/api/receipts', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    );
  },
};
