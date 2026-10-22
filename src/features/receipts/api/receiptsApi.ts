import type { CreatePaymentReceiptRequest, PaymentReceiptDataDto, PaymentReceiptDto } from '@ledgercraft/contracts';
import { readApiFailure } from '@/lib/api/readApiError';
import type { Receipt } from '@/types/payment';

export function receiptsApiEnabled(): boolean {
  return import.meta.env.VITE_RECEIPTS_API !== 'false';
}

export class ReceiptsApiError extends Error {
  readonly requestId?: string;

  constructor(
    message: string,
    readonly status: number,
    requestId?: string,
  ) {
    super(message);
    this.name = 'ReceiptsApiError';
    this.requestId = requestId;
  }
}

function toReceipt(dto: PaymentReceiptDto): Receipt {
  const data = dto.receiptData;
  return {
    id: dto.id,
    paymentId: dto.paymentId,
    receiptNumber: dto.receiptNumber,
    userId: '',
    generatedAt: dto.generatedAt,
    emailSentAt: dto.emailSentAt ?? undefined,
    isEmailed: dto.isEmailed,
    receiptData: toReceiptData(data, dto.receiptNumber, dto.createdAt),
    createdAt: dto.createdAt,
  };
}

function toReceiptData(data: PaymentReceiptDataDto, receiptNumber: string, createdAt: string) {
  const amountPaid = Number(data.amountPaid);
  return {
    payment: {
      id: data.paymentId,
      invoiceId: data.invoiceId,
      invoiceNumber: data.invoiceNumber,
      userId: '',
      paymentMethod: data.paymentMethod,
      amount: amountPaid,
      paymentDate: data.paymentDate,
      status: 'completed' as const,
      createdAt,
      updatedAt: createdAt,
    },
    invoice: {
      id: data.invoiceId,
      invoiceNumber: data.invoiceNumber,
      customerId: '',
      date: data.invoiceDate ?? data.paymentDate,
      dueDate: data.invoiceDueDate ?? '',
      items: [],
      subtotal: Number(data.invoiceTotal),
      taxAmount: 0,
      total: Number(data.invoiceTotal),
      totalPaid: Number(data.totalPaid),
      balanceDue: Number(data.balanceDue),
      paymentStatus: Number(data.balanceDue) === 0 ? 'paid' as const : 'partially_paid' as const,
      taxInclusive: false,
      status: Number(data.balanceDue) === 0 ? 'paid' as const : 'sent' as const,
      currency: data.currency,
    },
    customer: {
      id: '',
      name: data.customerName,
      email: data.customerEmail ?? '',
      address: null,
      city: null,
      state: null,
      zip: null,
      country: 'NZ',
      phone: null,
      isVip: false,
      tags: [],
    },
    receiptNumber,
    paymentDate: data.paymentDate,
    amountPaid,
    paymentMethod: data.paymentMethod.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
    balanceAfterPayment: Number(data.balanceDue),
  };
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
  if (!response.ok) {
    const failure = await readApiFailure(response);
    throw new ReceiptsApiError(failure.message, failure.status, failure.requestId);
  }
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
