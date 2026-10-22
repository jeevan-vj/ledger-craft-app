import {
  billListResponseSchema,
  billSchema,
  createVendorRequestSchema,
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
import { postBillPayment, postReceivedBill, restoreBill, reverseBill } from './purchases.journal';
import { assertKeyOwned } from '../storage/keys';
import type { AttachBillObjectRequest, ImportVendorsRequest } from '@ledgercraft/contracts';
import {
  assertReplayMatches,
  getIdempotencyRecord,
  insertIdempotencyRecord,
  type IdempotencyScope,
} from '../invoices/idempotency';
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
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    if (input.defaultAccountId && !(await repo.hasAccount(tx, ctx.organisationId, input.defaultAccountId))) {
      throw new HTTPException(400, { message: 'Default account not found' });
    }
    return repo.insertVendor(tx, ctx, input);
  });
}

export async function updateVendorForUser(db: Database, userId: string, id: string, input: UpdateVendorRequest) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    if (input.defaultAccountId && !(await repo.hasAccount(tx, ctx.organisationId, input.defaultAccountId))) {
      throw new HTTPException(400, { message: 'Default account not found' });
    }
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

export async function createBillForUser(
  db: Database,
  userId: string,
  input: CreateBillRequest,
  idempotency?: IdempotencyScope,
) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    if (idempotency) {
      const existing = await getIdempotencyRecord(tx, ctx, idempotency);
      if (existing) {
        assertReplayMatches(existing.requestHash, idempotency.requestHash);
        return billSchema.parse(existing.responseBody);
      }
    }
    await validateVendorAndAccounts(tx, ctx.organisationId, input);
    const bill = await repo.insertBill(tx, ctx, input);
    if (idempotency) {
      await insertIdempotencyRecord(tx, ctx, idempotency, { status: 201, body: bill });
    }
    return bill;
  });
}

export async function updateBillForUser(db: Database, userId: string, id: string, input: UpdateBillRequest) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const existing = await repo.getBill(tx, ctx.organisationId, id);
    if (!existing) throw new HTTPException(404, { message: 'Bill not found' });
    if (existing.lifecycleStatus !== 'draft') throw new HTTPException(409, { message: 'Only draft bills can be edited' });
    await validateVendorAndAccounts(tx, ctx.organisationId, input);
    const updated = await repo.updateBill(tx, ctx.organisationId, id, input);
    await repo.appendBillHistory(tx, ctx, id, 'updated', 'Draft bill updated');
    return updated;
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
    await repo.markBillReceived(tx, ctx.organisationId, id);
    await repo.appendBillHistory(tx, ctx, id, 'received', 'Bill received and posted');
    return repo.getBill(tx, ctx.organisationId, id);
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
    await repo.markBillVoid(tx, ctx.organisationId, id);
    await repo.appendBillHistory(tx, ctx, id, 'cancelled', 'Bill cancelled and journal reversed');
    return repo.getBill(tx, ctx.organisationId, id);
  });
}

export async function restoreBillForUser(db: Database, userId: string, id: string) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const bill = await repo.getBill(tx, ctx.organisationId, id);
    if (!bill) throw new HTTPException(404, { message: 'Bill not found' });
    if (bill.lifecycleStatus !== 'void' || decimal(bill.totalPaid).compare(0) > 0) {
      throw new HTTPException(409, { message: 'Only an unpaid cancelled bill can be restored' });
    }
    await restoreBill(tx, ctx, bill);
    await repo.markBillRestored(tx, ctx.organisationId, id);
    await repo.appendBillHistory(tx, ctx, id, 'restored', 'Bill restored to received');
    return repo.getBill(tx, ctx.organisationId, id);
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
    const allocations = input.allocations ?? [{ bankAccountId: input.bankAccountId!, amount: input.amount! }];
    for (const allocation of allocations) {
      if (!(await repo.hasBankAccount(tx, ctx.organisationId, allocation.bankAccountId))) {
        throw new HTTPException(400, { message: 'Bank account not found' });
      }
    }
    const total = allocations.reduce((sum, allocation) => sum.add(allocation.amount), decimal(0));
    if (total.compare(bill.balanceDue) > 0) {
      throw new HTTPException(400, { message: 'Payment exceeds the bill balance' });
    }
    const payments = [];
    for (const allocation of allocations) {
      const payment = await repo.insertPayment(tx, ctx, bill, { ...input, ...allocation });
      await postBillPayment(tx, ctx, bill, payment);
      payments.push(payment);
    }
    await repo.applyPayment(tx, ctx.organisationId, bill, total.toFixed());
    await repo.appendBillHistory(tx, ctx, id, 'payment_recorded', `${payments.length} payment allocation${payments.length === 1 ? '' : 's'} recorded (${total.toFixed()})`);
    return { payments, total: total.toFixed() };
  });
}

export async function attachBillObjectForUser(db: Database, userId: string, id: string, input: AttachBillObjectRequest) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    if (!(await repo.getBill(tx, ctx.organisationId, id))) throw new HTTPException(404, { message: 'Bill not found' });
    assertKeyOwned(input.objectKey, ctx.organisationId);
    const attachment = await repo.attachObject(tx, ctx, id, input);
    await repo.appendBillHistory(tx, ctx, id, 'attachment_added', `Attached ${input.filename}`);
    return attachment;
  });
}

export async function removeBillAttachmentForUser(db: Database, userId: string, id: string, attachmentId: string) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const removed = await repo.removeAttachment(tx, ctx.organisationId, id, attachmentId);
    if (!removed) throw new HTTPException(404, { message: 'Attachment not found' });
    await repo.appendBillHistory(tx, ctx, id, 'attachment_removed', `Removed ${removed.filename}`);
  });
}

function csvCell(value: unknown) {
  const text = String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
}

function parseCsvRow(row: string) {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < row.length; index += 1) {
    const character = row[index];
    if (character === '"') {
      if (quoted && row[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += character;
    }
  }
  cells.push(cell.trim());
  return cells;
}

export async function exportVendorsForUser(db: Database, userId: string) {
  const response = await listVendorsForUser(db, userId);
  return ['importIdentifier,name,contactName,email,phone,taxId,address,paymentTermDays,defaultAccountId,defaultTaxRate,isActive', ...response.vendors.map((vendor) => [
    vendor.importIdentifier, vendor.name, vendor.contactName, vendor.email, vendor.phone, vendor.taxId, vendor.address,
    vendor.paymentTermDays, vendor.defaultAccountId, vendor.defaultTaxRate, vendor.isActive,
  ].map(csvCell).join(','))].join('\n');
}

export async function importVendorsForUser(db: Database, userId: string, input: ImportVendorsRequest) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const rows = input.csv.trim().split(/\r?\n/).slice(1).filter((row) => row.trim());
    const errors: Array<{ row: number; message: string }> = [];
    const valid: CreateVendorRequest[] = [];
    rows.forEach((row, index) => {
      const [importIdentifier, name, contactName, email, phone, taxId, address, paymentTermDays, defaultAccountId, defaultTaxRate, isActive] = parseCsvRow(row);
      const parsed = createVendorRequestSchema.safeParse({
        name,
        importIdentifier: importIdentifier || null,
        contactName: contactName || null,
        email: email || null,
        phone: phone || null,
        taxId: taxId || null,
        address: address || null,
        paymentTermDays: Number(paymentTermDays || 20),
        defaultAccountId: defaultAccountId || null,
        defaultTaxRate: defaultTaxRate || '15',
        isActive: isActive?.toLowerCase() !== 'false',
      });
      if (!parsed.success) {
        errors.push({ row: index + 2, message: parsed.error.issues.map((issue) => issue.message).join('; ') });
      } else {
        valid.push(parsed.data);
      }
    });
    if (errors.length === 0) {
      for (const vendor of valid) {
        if (vendor.defaultAccountId && !(await repo.hasAccount(tx, ctx.organisationId, vendor.defaultAccountId))) {
          errors.push({ row: valid.indexOf(vendor) + 2, message: 'Default account not found' });
        }
      }
      if (!input.dryRun && errors.length === 0) {
        for (const vendor of valid) {
          const existing = vendor.importIdentifier
            ? await repo.getVendorByImportIdentifier(tx, ctx.organisationId, vendor.importIdentifier)
            : undefined;
          if (existing) await repo.updateVendor(tx, ctx.organisationId, existing.id, vendor);
          else await repo.insertVendor(tx, ctx, vendor);
        }
      }
    }
    return { dryRun: input.dryRun, validRows: valid.length, appliedRows: input.dryRun || errors.length ? 0 : valid.length, errors };
  });
}

export async function exportBillsForUser(db: Database, userId: string) {
  const response = await listBillsForUser(db, userId);
  return ['billNumber,vendorName,vendorReference,issueDate,dueDate,status,currency,total,totalPaid,balanceDue', ...response.bills.map((bill) => [bill.billNumber, bill.vendorName, bill.vendorReference, bill.issueDate, bill.dueDate, bill.displayStatus, bill.currency, bill.total, bill.totalPaid, bill.balanceDue].map(csvCell).join(','))].join('\n');
}
