import { apiRequest, AuthApiError } from '@/features/auth/api/http';
import {
  toBusinessProfile,
  type MobileBusinessProfileDto,
} from '@/features/business-profile/api/businessProfileApi';
import { customersApi, customersApiEnabled } from '@/features/customers/api/customersApi';
import type { BusinessProfile, Customer, Invoice, InvoiceStatus, LineItem } from '@/types/invoice';
import { randomId } from '@/utils/id';

export interface MobileInvoiceDto {
  id: string;
  invoiceNumber: string;
  externalId?: string | null;
  customerId: string;
  date: string;
  dueDate: string;
  paymentTermDays: number | null;
  subtotal: string;
  taxAmount: string;
  discountType: 'fixed' | 'percent';
  discountPercent: string | null;
  discount: string | null;
  additionalCharges: string | null;
  additionalChargesList?: Array<{
    id: string;
    name: string;
    amount: string;
    calculationType: 'fixed' | 'percentage';
    isActive: boolean;
  }>;
  additionalChargesTotal?: string;
  total: string;
  totalPaid: string;
  balanceDue: string;
  paymentStatus: string;
  taxInclusive: boolean;
  status: InvoiceStatus;
  notes: string | null;
  terms: string | null;
  currency: string;
  customerName: string | null;
  sourceQuoteId?: string;
  sourceQuoteNumber?: string;
  items: Array<{
    id: string;
    description: string;
    quantity: string;
    unit: string;
    rate: string;
    rateUnit: string;
    tax: string | null;
    total: string;
    discountType?: 'fixed' | 'percent';
    discountValue?: string | null;
    discountAmount?: string;
    taxes?: Array<{ id: string; name: string; rate: string }>;
  }>;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
}

export interface MobileShareInvoiceResponse {
  shareToken: string;
  expiresAt: string | null;
  isActive: boolean;
}

export interface MobileSharedInvoiceSnapshot {
  invoice: Invoice;
  templateName: string;
  businessProfile: BusinessProfile;
}

export function invoicesApiEnabled(): boolean {
  return process.env.EXPO_PUBLIC_INVOICES_API !== 'false';
}

function money(value: number | string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value == null) return null;
  return String(value);
}

function toLine(dto: MobileInvoiceDto['items'][number]): LineItem {
  return {
    id: dto.id,
    description: dto.description,
    quantity: Number(dto.quantity),
    unit: dto.unit,
    rate: Number(dto.rate),
    total: Number(dto.total),
    tax: dto.tax == null ? undefined : Number(dto.tax),
    discountType: dto.discountType,
    discountValue: dto.discountValue == null ? null : Number(dto.discountValue),
    discountAmount: Number(dto.discountAmount ?? 0),
    taxes: dto.taxes?.map((tax) => ({ ...tax, rate: Number(tax.rate) })),
  };
}

export function toInvoice(dto: MobileInvoiceDto): Invoice {
  return {
    id: dto.id,
    invoiceNumber: dto.invoiceNumber,
    externalId: dto.externalId,
    customerId: dto.customerId,
    customer: dto.customerName
      ? {
          id: dto.customerId,
          name: dto.customerName,
          email: '',
        }
      : undefined,
    date: dto.date,
    dueDate: dto.dueDate,
    items: dto.items.map(toLine),
    subtotal: Number(dto.subtotal),
    taxAmount: Number(dto.taxAmount),
    discount: dto.discount == null ? null : Number(dto.discount),
    additionalCharges: dto.additionalCharges == null ? null : Number(dto.additionalCharges),
    additionalChargesList: dto.additionalChargesList?.map((charge) => ({
      ...charge,
      amount: Number(charge.amount),
    })),
    additionalChargesTotal:
      dto.additionalChargesTotal == null ? undefined : Number(dto.additionalChargesTotal),
    total: Number(dto.total),
    totalPaid: Number(dto.totalPaid),
    balanceDue: Number(dto.balanceDue),
    paymentStatus: dto.paymentStatus,
    taxInclusive: dto.taxInclusive,
    status: dto.status,
    notes: dto.notes,
    terms: dto.terms,
    currency: dto.currency,
    sourceQuoteId: dto.sourceQuoteId,
    sourceQuoteNumber: dto.sourceQuoteNumber,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    archivedAt: dto.archivedAt,
  };
}

function toCreateBody(
  invoice: Partial<Invoice>,
  lineItems: LineItem[],
): Record<string, unknown> {
  const taxableBase = Number(invoice.subtotal ?? 0) - Number(invoice.discount ?? 0);
  const taxRate =
    invoice.taxAmount && taxableBase > 0
      ? String(Math.round((invoice.taxAmount / taxableBase) * 10000) / 100)
      : '0';
  return {
    customerId: invoice.customerId,
    date: invoice.date,
    dueDate: invoice.dueDate,
    notes: invoice.notes ?? null,
    terms: invoice.terms ?? null,
    currency: invoice.currency || 'NZD',
    taxInclusive: false,
    taxRate,
    discount: money(invoice.discount),
    additionalCharges: money(invoice.additionalCharges),
    status: invoice.status === 'cancelled' ? 'draft' : invoice.status,
    items: lineItems.map((item) => ({
      description: item.description,
      quantity: String(item.quantity),
      unit: item.unit || 'ea',
      rate: String(item.rate),
      rateUnit: item.unit || 'ea',
      discountType: item.discountType,
      discountValue: money(item.discountValue),
      taxes: item.taxes?.map((tax) => ({ ...tax, rate: String(tax.rate) })),
    })),
  };
}

export const invoicesApi = {
  async list(): Promise<Invoice[]> {
    const body = await apiRequest<{ invoices: MobileInvoiceDto[] }>('/api/invoices', {
      method: 'GET',
    });
    return body.invoices.map(toInvoice);
  },

  async get(id: string): Promise<Invoice> {
    return toInvoice(await apiRequest<MobileInvoiceDto>(`/api/invoices/${id}`, { method: 'GET' }));
  },

  async create(invoice: Partial<Invoice>, lineItems: LineItem[]): Promise<Invoice> {
    return toInvoice(
      await apiRequest<MobileInvoiceDto>('/api/invoices', {
        method: 'POST',
        headers: { 'Idempotency-Key': randomId() },
        body: JSON.stringify(toCreateBody(invoice, lineItems)),
      }),
    );
  },

  async update(id: string, invoice: Partial<Invoice>, lineItems?: LineItem[]): Promise<Invoice> {
    return toInvoice(
      await apiRequest<MobileInvoiceDto>(`/api/invoices/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          notes: invoice.notes,
          terms: invoice.terms,
          date: invoice.date,
          dueDate: invoice.dueDate,
          discount: money(invoice.discount),
          additionalCharges: money(invoice.additionalCharges),
          status: invoice.status === 'cancelled' ? undefined : invoice.status,
          items:
            lineItems && lineItems.length > 0
              ? lineItems.map((item) => ({
                  description: item.description,
                  quantity: String(item.quantity),
                  unit: item.unit || 'ea',
                  rate: String(item.rate),
                  rateUnit: item.unit || 'ea',
                  discountType: item.discountType,
                  discountValue: money(item.discountValue),
                  taxes: item.taxes?.map((tax) => ({ ...tax, rate: String(tax.rate) })),
                }))
              : undefined,
        }),
      }),
    );
  },

  async updateStatus(id: string, status: Exclude<InvoiceStatus, 'cancelled'>): Promise<Invoice> {
    return toInvoice(
      await apiRequest<MobileInvoiceDto>(`/api/invoices/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    );
  },

  async cancel(id: string): Promise<Invoice> {
    return toInvoice(await apiRequest<MobileInvoiceDto>(`/api/invoices/${id}/cancel`, { method: 'POST', body: '{}' }));
  },

  async restore(id: string): Promise<Invoice> {
    return toInvoice(await apiRequest<MobileInvoiceDto>(`/api/invoices/${id}/restore`, { method: 'POST', body: '{}' }));
  },

  async archive(id: string): Promise<Invoice> {
    return toInvoice(await apiRequest<MobileInvoiceDto>(`/api/invoices/${id}`, { method: 'DELETE' }));
  },

  async duplicate(id: string): Promise<Invoice> {
    return toInvoice(await apiRequest<MobileInvoiceDto>(`/api/invoices/${id}/duplicate`, { method: 'POST', headers: { 'Idempotency-Key': randomId() } }));
  },

  async history(id: string): Promise<{ id: string; action: string; reason: string | null; createdAt: string }[]> {
    return (await apiRequest<{ history: { id: string; action: string; reason: string | null; createdAt: string }[] }>(`/api/invoices/${id}/history`, { method: 'GET' })).history;
  },

  async attachments(id: string): Promise<{ id: string; filename: string; size: number; contentType: string; createdAt: string }[]> {
    return (await apiRequest<{ attachments: { id: string; filename: string; size: number; contentType: string; createdAt: string }[] }>(`/api/invoices/${id}/attachments`, { method: 'GET' })).attachments;
  },

  async attach(id: string, input: { objectKey: string; filename: string }): Promise<{ id: string; filename: string; size: number; contentType: string; createdAt: string }> {
    return apiRequest(`/api/invoices/${id}/attachments`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async share(id: string, templateName = 'classic'): Promise<MobileShareInvoiceResponse> {
    return apiRequest<MobileShareInvoiceResponse>(`/api/invoices/${encodeURIComponent(id)}/share`, {
      method: 'POST',
      body: JSON.stringify({ templateName }),
    });
  },

  async getShared(token: string): Promise<MobileSharedInvoiceSnapshot | null> {
    try {
      const dto = await apiRequest<{
        invoice: MobileInvoiceDto;
        templateName: string;
        businessProfile: MobileBusinessProfileDto;
      }>(`/api/public/invoices/${encodeURIComponent(token)}`, { method: 'GET' });
      return {
        invoice: toInvoice(dto.invoice),
        templateName: dto.templateName,
        businessProfile: toBusinessProfile(dto.businessProfile),
      };
    } catch (error) {
      if (error instanceof AuthApiError && error.status === 404) {
        return null;
      }
      throw error;
    }
  },

  async nextNumber(): Promise<string> {
    const body = await apiRequest<{ invoiceNumber: string }>('/api/invoices/next-number', {
      method: 'GET',
    });
    return body.invoiceNumber;
  },

  async customers(): Promise<Customer[]> {
    if (!customersApiEnabled()) {
      return [];
    }
    const rows = await customersApi.list();
    return rows.map((customer) => ({
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      address: customer.address,
      city: customer.city,
      state: customer.state,
      zip: customer.zip,
      country: customer.country,
    }));
  },
};
