import type { RecurringPayload, RecurringSchedule } from '@ledgercraft/contracts';
import type { AdditionalCharge, LineItem } from '@/types';
import { formatDate } from '@/utils/invoiceUtils';
import { recurringApi } from './api';
import type { InvoiceDeliverySettings } from './components/RepeatSchedulePanel';

type InvoiceEditorValues = {
  customerId: string;
  date: Date | string;
  dueDate: Date | string;
  currency?: string;
  notes?: string | null;
  terms?: string | null;
  paymentTermDays?: number | null;
  taxInclusive?: boolean;
  taxRate?: number | string | null;
  discountType?: 'fixed' | 'percent';
  discountPercent?: number | string | null;
  discount?: number | string | null;
  additionalCharges?: number | string | null;
  additionalChargesList?: AdditionalCharge[];
};

const money = (value: number | string | null | undefined) => value == null ? undefined : String(value);
const dateOnly = (value: Date | string) => typeof value === 'string' ? value.slice(0, 10) : formatDate(value);

export function buildRecurringInvoicePayload({
  values,
  items,
  delivery,
}: {
  values: InvoiceEditorValues;
  items: LineItem[];
  delivery: InvoiceDeliverySettings;
}): RecurringPayload {
  return {
    kind: 'invoice',
    input: {
      customerId: values.customerId,
      date: dateOnly(values.date),
      dueDate: dateOnly(values.dueDate),
      currency: values.currency || 'NZD',
      notes: values.notes ?? null,
      terms: values.terms ?? null,
      paymentTermDays: values.paymentTermDays ?? undefined,
      taxInclusive: values.taxInclusive,
      taxRate: money(values.taxRate),
      discountType: values.discountType,
      discountPercent: money(values.discountPercent),
      discount: money(values.discount),
      additionalCharges: money(values.additionalCharges),
      additionalChargesList: values.additionalChargesList?.map((charge) => ({ ...charge, amount: String(charge.amount) })),
      status: 'draft',
      items: items.map((item) => ({
        description: item.description,
        quantity: String(item.quantity),
        unit: item.unit || 'ea',
        rate: String(item.rate),
        rateUnit: item.rateUnit || item.unit || 'ea',
        discountType: item.discountType,
        discountValue: money(item.discountValue),
        taxes: item.taxes?.map((tax) => ({ ...tax, rate: String(tax.rate) })),
      })),
    },
    send: delivery,
  };
}

export async function upsertRecurringInvoiceTemplate({
  sourceInvoiceId,
  name,
  payload,
  schedule,
}: {
  sourceInvoiceId: string;
  name: string;
  payload: RecurringPayload;
  schedule: RecurringSchedule;
}) {
  const { templates } = await recurringApi.list();
  const existing = templates.find((template) => template.sourceInvoiceId === sourceInvoiceId);
  const request = { name, payload, schedule, sourceInvoiceId };
  return existing ? recurringApi.update(existing.id, request) : recurringApi.create(request);
}
