import {
  bankTransactionAttachmentSchema,
  bankTransactionDocumentConnectionSchema,
  bankTransactionSplitSchema,
  type BankTransactionAttachmentDto,
  type BankTransactionDetailsRequest,
  type BankTransactionDocumentConnectionDto,
  type BankTransactionDto,
  type BankTransactionSplitDto,
} from '@ledgercraft/contracts';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../../db/client';
import {
  bankTransactionAttachments,
  bankTransactionDocumentConnections,
  bankTransactionSplits,
} from '../../db/schema/bank';
import { invoices } from '../../db/schema/invoices';
import { bills } from '../../db/schema/purchases';
import { roundMoney } from '../invoices/money';

export async function getDetails(tx: Database, organisationId: string, transactionId: string) {
  const [splits, connections, attachments] = await Promise.all([
    tx.select().from(bankTransactionSplits).where(and(
      eq(bankTransactionSplits.organisationId, organisationId),
      eq(bankTransactionSplits.transactionId, transactionId),
    )),
    tx.select().from(bankTransactionDocumentConnections).where(and(
      eq(bankTransactionDocumentConnections.organisationId, organisationId),
      eq(bankTransactionDocumentConnections.transactionId, transactionId),
    )),
    tx.select().from(bankTransactionAttachments).where(and(
      eq(bankTransactionAttachments.organisationId, organisationId),
      eq(bankTransactionAttachments.transactionId, transactionId),
    )),
  ]);
  return {
    splits: splits.map((row): BankTransactionSplitDto => bankTransactionSplitSchema.parse({
      id: row.id, category: row.category, description: row.description ?? null, amount: roundMoney(row.amount),
    })),
    documentConnections: connections.map((row): BankTransactionDocumentConnectionDto => bankTransactionDocumentConnectionSchema.parse({
      id: row.id, documentType: row.documentType, documentId: row.documentId,
      documentNumber: row.documentNumber, amount: roundMoney(row.amount),
    })),
    attachments: attachments.map((row): BankTransactionAttachmentDto => bankTransactionAttachmentSchema.parse({
      id: row.id, objectKey: row.objectKey, filename: row.filename, contentType: row.contentType, size: row.size,
    })),
  };
}

export async function hydrateTransaction(tx: Database, organisationId: string, transaction: BankTransactionDto): Promise<BankTransactionDto> {
  return { ...transaction, ...await getDetails(tx, organisationId, transaction.id) };
}

export async function insertDetails(
  tx: Database,
  organisationId: string,
  transactionId: string,
  input: BankTransactionDetailsRequest,
) {
  if (input.splits.length) await tx.insert(bankTransactionSplits).values(input.splits.map((split) => ({
    organisationId, transactionId, category: split.category,
    description: split.description ?? null, amount: roundMoney(split.amount),
  })));
  if (input.documentConnections.length) await tx.insert(bankTransactionDocumentConnections).values(input.documentConnections.map((connection) => ({
    organisationId, transactionId, documentType: connection.documentType,
    documentId: connection.documentId, documentNumber: '', amount: roundMoney(connection.amount),
  })));
  if (input.attachments.length) await tx.insert(bankTransactionAttachments).values(input.attachments.map((attachment) => ({
    organisationId, transactionId, ...attachment,
  })));
}

export async function setConnectionDocumentNumber(
  tx: Database,
  organisationId: string,
  transactionId: string,
  documentType: 'invoice' | 'bill',
  documentId: string,
  documentNumber: string,
) {
  await tx.update(bankTransactionDocumentConnections).set({ documentNumber }).where(and(
    eq(bankTransactionDocumentConnections.organisationId, organisationId),
    eq(bankTransactionDocumentConnections.transactionId, transactionId),
    eq(bankTransactionDocumentConnections.documentType, documentType),
    eq(bankTransactionDocumentConnections.documentId, documentId),
  ));
}

export async function getDocument(tx: Database, organisationId: string, type: 'invoice' | 'bill', id: string) {
  if (type === 'invoice') {
    const [row] = await tx.select({
      id: invoices.id, number: invoices.invoiceNumber, currency: invoices.currency,
      balanceDue: invoices.balanceDue, totalPaid: invoices.totalPaid, status: invoices.status,
    }).from(invoices).where(and(eq(invoices.organisationId, organisationId), eq(invoices.id, id)));
    return row;
  }
  const [row] = await tx.select({
    id: bills.id, number: bills.billNumber, currency: bills.currency,
    balanceDue: bills.balanceDue, totalPaid: bills.totalPaid, status: bills.lifecycleStatus,
  }).from(bills).where(and(eq(bills.organisationId, organisationId), eq(bills.id, id)));
  return row;
}

export async function applyDocumentAllocation(
  tx: Database,
  organisationId: string,
  type: 'invoice' | 'bill',
  id: string,
  totals: { totalPaid: string; balanceDue: string },
) {
  if (type === 'invoice') {
    const paid = totals.balanceDue === '0.00';
    await tx.update(invoices).set({
      totalPaid: totals.totalPaid,
      balanceDue: totals.balanceDue,
      paymentStatus: paid ? 'paid' : 'partially_paid',
      status: paid ? 'paid' : undefined,
      updatedAt: new Date(),
    }).where(and(eq(invoices.organisationId, organisationId), eq(invoices.id, id)));
    return;
  }
  await tx.update(bills).set({
    totalPaid: totals.totalPaid,
    balanceDue: totals.balanceDue,
    paymentStatus: totals.balanceDue === '0.00' ? 'paid' : 'partial',
    updatedAt: new Date(),
  }).where(and(eq(bills.organisationId, organisationId), eq(bills.id, id)));
}

export async function hasDetails(tx: Database, organisationId: string, transactionId: string): Promise<boolean> {
  const details = await getDetails(tx, organisationId, transactionId);
  return details.splits.length > 0 || details.documentConnections.length > 0 || details.attachments.length > 0;
}
