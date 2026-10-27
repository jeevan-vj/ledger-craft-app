import {
  saleResponseSchema,
  type CreateInvoiceRequest,
  type CreateSaleRequest,
  type SaleResponse,
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
import { createInvoiceInTx } from '../invoices/invoices.service';
import * as invoicesRepo from '../invoices/invoices.repository';
import * as itemsRepo from '../items/items.repository';
import { createPaymentInTx } from '../payments/payments.service';
import { createReceiptInTx } from '../receipts/receipts.service';

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
