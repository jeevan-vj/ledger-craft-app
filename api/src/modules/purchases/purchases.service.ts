import {
  billListResponseSchema,
  vendorListResponseSchema,
  type CreateBillRequest,
  type CreateVendorRequest,
  type RecordBillPaymentRequest,
  type UpdateBillRequest,
  type UpdateVendorRequest,
} from '@ledgercraft/contracts';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import { withOrganisationTx } from '../auth/bind-organisation';
import { decimal } from '../invoices/money';
import { postBillPayment, postReceivedBill, reverseBill } from './purchases.journal';
import * as repo from './purchases.repository';

async function validateVendorAndAccounts(
  tx: Database,
  organisationId: string,
  input: Pick<CreateBillRequest, 'vendorId' | 'lines'> | UpdateBillRequest,
) {
  if (input.vendorId && !(await repo.getVendor(tx, organisationId, input.vendorId))) {
    throw new HTTPException(400, { message: 'Vendor not found' });
  }
  if (input.lines) {
    for (const line of input.lines) {
      if (!line.accountId) continue;
      if (!(await repo.hasAccount(tx, organisationId, line.accountId))) {
        throw new HTTPException(400, { message: 'Bill line account not found' });
      }
    }
  }
}

export async function listVendorsForUser(db: Database, userId: string) {
  return withOrganisationTx(db, userId, async (tx, ctx) =>
    vendorListResponseSchema.parse({ vendors: await repo.listVendors(tx, ctx.organisationId) }));
}

export async function getVendorForUser(db: Database, userId: string, id: string) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const vendor = await repo.getVendor(tx, ctx.organisationId, id);
    if (!vendor) throw new HTTPException(404, { message: 'Vendor not found' });
    return vendor;
  });
}

export async function createVendorForUser(db: Database, userId: string, input: CreateVendorRequest) {
  return withOrganisationTx(db, userId, (tx, ctx) => repo.insertVendor(tx, ctx, input));
}

export async function updateVendorForUser(db: Database, userId: string, id: string, input: UpdateVendorRequest) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const vendor = await repo.updateVendor(tx, ctx.organisationId, id, input);
    if (!vendor) throw new HTTPException(404, { message: 'Vendor not found' });
    return vendor;
  });
}

export async function deleteVendorForUser(db: Database, userId: string, id: string) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    if (!(await repo.deleteVendor(tx, ctx.organisationId, id))) {
      throw new HTTPException(404, { message: 'Vendor not found' });
    }
  });
}

export async function listBillsForUser(db: Database, userId: string) {
  return withOrganisationTx(db, userId, async (tx, ctx) =>
    billListResponseSchema.parse({ bills: await repo.listBills(tx, ctx.organisationId) }));
}

export async function getBillForUser(db: Database, userId: string, id: string) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const bill = await repo.getBill(tx, ctx.organisationId, id);
    if (!bill) throw new HTTPException(404, { message: 'Bill not found' });
    return bill;
  });
}

export async function createBillForUser(db: Database, userId: string, input: CreateBillRequest) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    await validateVendorAndAccounts(tx, ctx.organisationId, input);
    return repo.insertBill(tx, ctx, input);
  });
}

export async function updateBillForUser(db: Database, userId: string, id: string, input: UpdateBillRequest) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const existing = await repo.getBill(tx, ctx.organisationId, id);
    if (!existing) throw new HTTPException(404, { message: 'Bill not found' });
    if (existing.lifecycleStatus !== 'draft') throw new HTTPException(409, { message: 'Only draft bills can be edited' });
    await validateVendorAndAccounts(tx, ctx.organisationId, input);
    return repo.updateBill(tx, ctx.organisationId, id, input);
  });
}

export async function deleteBillForUser(db: Database, userId: string, id: string) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const bill = await repo.getBill(tx, ctx.organisationId, id);
    if (!bill) throw new HTTPException(404, { message: 'Bill not found' });
    if (bill.lifecycleStatus !== 'draft') throw new HTTPException(409, { message: 'Only draft bills can be deleted' });
    await repo.deleteBill(tx, ctx.organisationId, id);
  });
}

export async function receiveBillForUser(db: Database, userId: string, id: string) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const bill = await repo.getBill(tx, ctx.organisationId, id);
    if (!bill) throw new HTTPException(404, { message: 'Bill not found' });
    if (bill.lifecycleStatus === 'received') return bill;
    if (bill.lifecycleStatus !== 'draft') throw new HTTPException(409, { message: 'Bill cannot be received' });
    if (bill.lines.some((line) => !line.accountId)) {
      throw new HTTPException(400, { message: 'Every bill line needs an account before receiving' });
    }
    await postReceivedBill(tx, ctx, bill);
    return repo.markBillReceived(tx, ctx.organisationId, id);
  });
}

export async function voidBillForUser(db: Database, userId: string, id: string) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const bill = await repo.getBill(tx, ctx.organisationId, id);
    if (!bill) throw new HTTPException(404, { message: 'Bill not found' });
    if (bill.lifecycleStatus === 'void') return bill;
    if (bill.lifecycleStatus !== 'received' || decimal(bill.totalPaid).compare(0) > 0) {
      throw new HTTPException(409, { message: 'Only unpaid received bills can be voided' });
    }
    await reverseBill(tx, ctx, bill);
    return repo.markBillVoid(tx, ctx.organisationId, id);
  });
}

export async function recordBillPaymentForUser(
  db: Database,
  userId: string,
  id: string,
  input: RecordBillPaymentRequest,
) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const bill = await repo.getBill(tx, ctx.organisationId, id);
    if (!bill) throw new HTTPException(404, { message: 'Bill not found' });
    if (bill.lifecycleStatus !== 'received') throw new HTTPException(409, { message: 'Only received bills can be paid' });
    if (!(await repo.hasBankAccount(tx, ctx.organisationId, input.bankAccountId))) {
      throw new HTTPException(400, { message: 'Bank account not found' });
    }
    if (decimal(input.amount).compare(bill.balanceDue) > 0) {
      throw new HTTPException(400, { message: 'Payment exceeds the bill balance' });
    }
    const payment = await repo.insertPayment(tx, ctx, bill, input);
    await postBillPayment(tx, ctx, bill, payment);
    await repo.applyPayment(tx, ctx.organisationId, bill, payment.amount);
    return payment;
  });
}
