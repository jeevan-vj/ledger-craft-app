import {
  salesSummarySchema,
  saleResponseSchema,
  type CreateInvoiceRequest,
  type CreateSaleRequest,
  type SaleResponse,
  type SalesSummary,
} from '@ledgercraft/contracts';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import { withOrganisationTx, type OrganisationContext } from '../auth/bind-organisation';
import * as profileRepo from '../business-profile/business-profile.repository';
import { getLocalization } from '../currency/currency.repository';
import * as customersRepo from '../customers/customers.repository';
import {
  assertReplayMatches,
  getIdempotencyRecord,
  insertIdempotencyRecord,
  type IdempotencyScope,
} from '../invoices/idempotency';
import { decimal, roundMoney } from '../invoices/money';
import { createInvoiceInTx } from '../invoices/invoices.service';
import * as invoicesRepo from '../invoices/invoices.repository';
import * as itemsRepo from '../items/items.repository';
import { createPaymentInTx } from '../payments/payments.service';
import { createReceiptInTx } from '../receipts/receipts.service';
import { loadSalesDay, type SalesDayLine, type SalesDayPayment, type SalesDayRows } from './sales.repository';

const WALK_IN_TAG = 'walk-in';
const WALK_IN_NAME = 'Walk-in customer';

export function businessDate(timeZone: string, now = new Date()): string {
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(formatted)) {
    throw new HTTPException(400, { message: 'Timezone must be a valid IANA timezone' });
  }
  return formatted;
}

function lineTaxes(taxRate: string | null, gstApplies: boolean): CreateInvoiceRequest['items'][number]['taxes'] {
  if (!gstApplies || taxRate == null) return undefined;
  return [{ id: 'item', name: 'GST', rate: taxRate }];
}

async function invoiceLines(
  tx: Database,
  ctx: OrganisationContext,
  input: CreateSaleRequest,
  gstApplies: boolean,
): Promise<CreateInvoiceRequest['items']> {
  const lines: CreateInvoiceRequest['items'] = [];
  for (const line of input.lines) {
    if ('itemId' in line) {
      const item = await itemsRepo.getItem(tx, ctx.organisationId, line.itemId);
      if (!item || !item.isActive) {
        throw new HTTPException(400, { message: 'Item not found' });
      }
      lines.push({
        description: item.name,
        quantity: line.quantity,
        unit: item.unit,
        rate: line.price,
        taxes: lineTaxes(item.taxRate, gstApplies),
      });
      continue;
    }
    lines.push({
      description: line.label ?? 'Custom amount',
      quantity: line.quantity,
      unit: 'ea',
      rate: line.price,
    });
  }
  return lines;
}

async function customerForSale(
  tx: Database,
  ctx: OrganisationContext,
  input: CreateSaleRequest,
  country: string,
) {
  if (input.customerId) {
    const customer = await customersRepo.getCustomer(tx, ctx.organisationId, input.customerId);
    if (!customer) throw new HTTPException(400, { message: 'Customer not found' });
    return customer;
  }
  const existing = await customersRepo.findCustomerByTag(tx, ctx.organisationId, WALK_IN_TAG);
  if (existing) return existing;
  return customersRepo.insertCustomer(tx, ctx, {
    name: WALK_IN_NAME,
    email: '',
    country: country || 'NZ',
    tags: [WALK_IN_TAG],
  });
}

export async function createSaleForUser(
  db: Database,
  userId: string,
  input: CreateSaleRequest,
  idempotency: IdempotencyScope,
): Promise<SaleResponse> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const existing = await getIdempotencyRecord(tx, ctx, idempotency);
    if (existing) {
      assertReplayMatches(existing.requestHash, idempotency.requestHash);
      return saleResponseSchema.parse(existing.responseBody);
    }

    const profile = await profileRepo.getBusinessProfile(tx, ctx.organisationId);
    if (!profile) throw new HTTPException(400, { message: 'Set up your business profile first' });
    // `unknown` keeps the profile default, matching a normal invoice. Only an
    // explicit not-registered status suppresses GST, including an item tax rate.
    const gstApplies = profile.gstRegistrationStatus !== 'not_registered';
    const today = businessDate((await getLocalization(tx, ctx.organisationId)).timezone);
    const customer = await customerForSale(tx, ctx, input, profile.country);
    const draft = await createInvoiceInTx(tx, ctx, {
      customerId: customer.id,
      date: today,
      dueDate: today,
      taxInclusive: true,
      ...(gstApplies ? {} : { taxRate: '0' }),
      items: await invoiceLines(tx, ctx, input, gstApplies),
    });
    const payment = await createPaymentInTx(tx, ctx, {
      invoiceId: draft.id,
      paymentMethod: input.paymentMethod,
      amount: draft.total,
      paymentDate: today,
      referenceNumber: input.referenceNumber ?? null,
    });
    const invoice = await invoicesRepo.getInvoice(tx, ctx.organisationId, draft.id);
    if (!invoice) throw new HTTPException(500, { message: 'Invoice not found after payment' });
    const receipt = await createReceiptInTx(tx, ctx, { paymentId: payment.id });
    const response = saleResponseSchema.parse({ invoice, payment, receipt });
    await insertIdempotencyRecord(tx, ctx, idempotency, { status: 201, body: response });
    return response;
  });
}

const PAYMENT_METHOD_ORDER = ['cash', 'credit_card', 'bank_transfer', 'cheque', 'online'] as const;

/**
 * A counted sale needs no migration. `invoices.source` is only `manual` or
 * `import`, so the summary unions two facts already stored:
 * the customer tags include `walk-in`, or a POST `/api/sales` idempotency row
 * in this organisation names the invoice. The tag covers a paid invoice written
 * for the walk-in customer through the normal invoice API. The idempotency row
 * still covers a named-customer sale after that tag is edited or removed.
 * Completed payments must equal the invoice total, so the method totals add up
 * to the gross total; an unpaid walk-in draft is not takings. GST is the sum of
 * those invoices' `taxAmount`, never a sum of rounded line taxes. Line items do
 * not store an item id, so top items are grouped by the stored description.
 * `invoice.date` is already the business-timezone calendar day, so the query
 * matches that stored date.
 */
export async function salesSummaryForUser(db: Database, userId: string, date: string): Promise<SalesSummary> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const day = await loadSalesDay(tx, ctx.organisationId, date);
    return salesSummarySchema.parse(summariseSalesDay(date, day));
  });
}

function tagList(tags: unknown): string[] {
  const parsed = typeof tags === 'string' ? parseJson(tags) : tags;
  return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === 'string') : [];
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function isSale(invoice: SalesDayRows['invoices'][number], saleInvoiceIds: ReadonlySet<string>): boolean {
  if (invoice.lifecycleStatus === 'cancelled') return false;
  return saleInvoiceIds.has(invoice.id) || tagList(invoice.customerTags).includes(WALK_IN_TAG);
}

function paymentsFor(invoiceId: string, payments: SalesDayPayment[]): SalesDayPayment[] {
  return payments.filter((payment) => payment.invoiceId === invoiceId && payment.status === 'completed');
}

function summariseSalesDay(date: string, day: SalesDayRows): SalesSummary {
  const saleInvoiceIds = new Set(day.saleInvoiceIds);
  const sales = day.invoices.filter((invoice) => {
    if (!isSale(invoice, saleInvoiceIds)) return false;
    const paid = paymentsFor(invoice.id, day.payments).reduce((total, payment) => total.add(payment.amount), decimal(0));
    return paid.compare(invoice.total) === 0;
  });
  const saleIds = new Set(sales.map((invoice) => invoice.id));
  const payments = day.payments.filter((payment) => saleIds.has(payment.invoiceId) && payment.status === 'completed');
  const lines = day.lines.filter((line) => saleIds.has(line.invoiceId));
  return {
    date,
    count: sales.length,
    grossTotal: roundMoney(sales.reduce((total, invoice) => total.add(invoice.total), decimal(0))),
    gstTotal: roundMoney(sales.reduce((total, invoice) => total.add(invoice.taxAmount), decimal(0))),
    paymentMethods: methodTotals(payments),
    topItemsByQuantity: rankItems(lines, 'quantity'),
    topItemsByAmount: rankItems(lines, 'amount'),
    sales: sales.map((invoice) => ({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      total: roundMoney(invoice.total),
      taxAmount: roundMoney(invoice.taxAmount),
    })),
  };
}

function methodTotals(payments: SalesDayPayment[]): SalesSummary['paymentMethods'] {
  const totals = new Map<string, ReturnType<typeof decimal>>();
  for (const payment of payments) {
    const current = totals.get(payment.paymentMethod) ?? decimal(0);
    totals.set(payment.paymentMethod, current.add(payment.amount));
  }
  return [...totals.entries()]
    .sort(([left], [right]) => methodRank(left) - methodRank(right) || left.localeCompare(right))
    .map(([paymentMethod, total]) => ({ paymentMethod, total: roundMoney(total) }));
}

function methodRank(method: string): number {
  const index = PAYMENT_METHOD_ORDER.indexOf(method as (typeof PAYMENT_METHOD_ORDER)[number]);
  return index === -1 ? PAYMENT_METHOD_ORDER.length : index;
}

function rankItems(lines: SalesDayLine[], by: 'quantity' | 'amount'): SalesSummary['topItemsByQuantity'] {
  const grouped = new Map<string, { quantity: ReturnType<typeof decimal>; amount: ReturnType<typeof decimal> }>();
  for (const line of lines) {
    const current = grouped.get(line.description) ?? { quantity: decimal(0), amount: decimal(0) };
    current.quantity = current.quantity.add(line.quantity);
    current.amount = current.amount.add(line.total);
    grouped.set(line.description, current);
  }
  return [...grouped.entries()]
    .map(([description, totals]) => ({
      description,
      quantity: roundMoney(totals.quantity),
      amount: roundMoney(totals.amount),
    }))
    .sort((left, right) => {
      const field = by === 'quantity' ? 'quantity' : 'amount';
      const difference = decimal(right[field]).compare(left[field]);
      return difference === 0 ? left.description.localeCompare(right.description) : difference;
    });
}
