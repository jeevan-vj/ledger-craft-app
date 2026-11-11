import { and, asc, eq } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { customsGstEntries } from '../../db/schema/tax';

export type CustomsGstRow = typeof customsGstEntries.$inferSelect;

export async function insertCustomsGst(
  tx: Database,
  ctx: { organisationId: string; userId: string },
  input: { invoiceDate: string; paymentDate: string | null; amount: string; reference: string; description: string },
): Promise<CustomsGstRow> {
  const [row] = await tx.insert(customsGstEntries).values({
    organisationId: ctx.organisationId, userId: ctx.userId, invoiceDate: input.invoiceDate, paymentDate: input.paymentDate,
    amount: input.amount, reference: input.reference, description: input.description, status: 'open',
  }).returning();
  if (!row) throw new Error('Failed to record Customs GST');
  return row;
}

export async function listCustomsGst(tx: Database, organisationId: string): Promise<CustomsGstRow[]> {
  return tx.select().from(customsGstEntries).where(eq(customsGstEntries.organisationId, organisationId)).orderBy(asc(customsGstEntries.invoiceDate), asc(customsGstEntries.createdAt));
}

export async function getCustomsGst(tx: Database, organisationId: string, id: string): Promise<CustomsGstRow | undefined> {
  const [row] = await tx.select().from(customsGstEntries).where(and(eq(customsGstEntries.organisationId, organisationId), eq(customsGstEntries.id, id)));
  return row;
}

export async function markCustomsGstPaid(tx: Database, organisationId: string, id: string, paymentDate: string): Promise<CustomsGstRow | undefined> {
  const [row] = await tx.update(customsGstEntries).set({ paymentDate, updatedAt: new Date() })
    .where(and(eq(customsGstEntries.organisationId, organisationId), eq(customsGstEntries.id, id), eq(customsGstEntries.status, 'open')))
    .returning();
  return row;
}

export async function markCustomsGstVoid(tx: Database, organisationId: string, id: string): Promise<CustomsGstRow | undefined> {
  const [row] = await tx.update(customsGstEntries).set({ status: 'void', updatedAt: new Date() })
    .where(and(eq(customsGstEntries.organisationId, organisationId), eq(customsGstEntries.id, id), eq(customsGstEntries.status, 'open')))
    .returning();
  return row;
}
