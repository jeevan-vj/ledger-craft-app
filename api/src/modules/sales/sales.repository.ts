import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { customers } from '../../db/schema/customers';
import { idempotencyKeys } from '../../db/schema/idempotency';
import { invoices, lineItems } from '../../db/schema/invoices';
import { payments } from '../../db/schema/payments';

export type SalesDayInvoice = {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerTags: unknown;
  total: string;
  taxAmount: string;
  lifecycleStatus: string;
  createdAt: Date;
};

export type SalesDayPayment = {
  invoiceId: string;
  paymentMethod: string;
  amount: string;
  status: string;
};

export type SalesDayLine = {
  invoiceId: string;
  description: string;
  quantity: string;
  total: string;
};

export type SalesDayRows = {
  invoices: SalesDayInvoice[];
  payments: SalesDayPayment[];
  lines: SalesDayLine[];
  saleInvoiceIds: string[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadSalesDay(
  tx: Database,
  organisationId: string,
  date: string,
): Promise<SalesDayRows> {
  const invoiceRows = await tx
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      customerId: invoices.customerId,
      customerTags: customers.tags,
      total: invoices.total,
      taxAmount: invoices.taxAmount,
      lifecycleStatus: invoices.lifecycleStatus,
      createdAt: invoices.createdAt,
    })
    .from(invoices)
    .innerJoin(customers, and(
      eq(customers.id, invoices.customerId),
      eq(customers.organisationId, organisationId),
    ))
    .where(and(eq(invoices.organisationId, organisationId), eq(invoices.date, date)))
    .orderBy(asc(invoices.createdAt), asc(invoices.invoiceNumber));

  if (invoiceRows.length === 0) return { invoices: invoiceRows, payments: [], lines: [], saleInvoiceIds: [] };

  const ids = invoiceRows.map((row) => row.id);
  const paymentRows = await tx
    .select({
      invoiceId: payments.invoiceId,
      paymentMethod: payments.paymentMethod,
      amount: payments.amount,
      status: payments.status,
    })
    .from(payments)
    .where(and(eq(payments.organisationId, organisationId), inArray(payments.invoiceId, ids)));
  const lineRows = await tx
    .select({
      invoiceId: lineItems.invoiceId,
      description: lineItems.description,
      quantity: lineItems.quantity,
      total: lineItems.total,
    })
    .from(lineItems)
    .where(and(eq(lineItems.organisationId, organisationId), inArray(lineItems.invoiceId, ids)));
  const saleKeys = await tx
    .select({
      invoiceId: sql<string | null>`json_extract(${idempotencyKeys.responseBody}, '$.invoice.id')`,
    })
    .from(idempotencyKeys)
    .where(and(
      eq(idempotencyKeys.organisationId, organisationId),
      eq(idempotencyKeys.method, 'POST'),
      eq(idempotencyKeys.path, '/api/sales'),
    ));
  const dayIds = new Set(ids);
  const saleInvoiceIds = saleKeys
    .map((row) => row.invoiceId)
    .filter((id): id is string => typeof id === 'string' && UUID.test(id) && dayIds.has(id));

  return { invoices: invoiceRows, payments: paymentRows, lines: lineRows, saleInvoiceIds };
}
