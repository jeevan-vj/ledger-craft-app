import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { reminderSettings, reminderOptOuts, reminderLogs } from '../../db/schema/customer-collections';
import { invoices } from '../../db/schema/invoices';
import { organisationMemberships } from '../../db/schema/identity';
import { customers } from '../../db/schema/customers';
export async function settings(tx: Database, org: string) { const [r] = await tx.select().from(reminderSettings).where(eq(reminderSettings.organisationId, org)); return r; }
export async function saveSettings(tx: Database, value: typeof reminderSettings.$inferInsert) { await tx.insert(reminderSettings).values(value).onConflictDoUpdate({ target: reminderSettings.organisationId, set: { ...value, updatedAt: new Date() } }); }
export async function optOut(tx: Database, org: string, kind: string, id: string) { const [r] = await tx.select().from(reminderOptOuts).where(and(eq(reminderOptOuts.organisationId, org), eq(reminderOptOuts.kind, kind), eq(reminderOptOuts.sourceId, id))); return r?.optOut ?? false; }
export async function saveOptOut(tx: Database, org: string, kind: string, id: string, optOut: boolean) { await tx.insert(reminderOptOuts).values({ organisationId: org, kind, sourceId: id, optOut }).onConflictDoUpdate({ target: [reminderOptOuts.organisationId, reminderOptOuts.kind, reminderOptOuts.sourceId], set: { optOut } }); }
export async function candidates(tx: Database, org: string) { return tx.select({ invoice: invoices, customer: customers }).from(invoices).innerJoin(customers, and(eq(customers.id, invoices.customerId), eq(customers.organisationId, org))).where(and(eq(invoices.organisationId, org), eq(invoices.lifecycleStatus, 'active'), inArray(invoices.status, ['sent', 'overdue']))); }
export async function logs(tx: Database, org: string, id: string) { return tx.select().from(reminderLogs).where(and(eq(reminderLogs.organisationId, org), eq(reminderLogs.invoiceId, id))); }
export async function claim(tx: Database, value: typeof reminderLogs.$inferInsert) { return tx.insert(reminderLogs).values(value).onConflictDoNothing().returning(); }
export async function finish(tx: Database, org: string, id: string, status: string, reason: string | null) { await tx.update(reminderLogs).set({ status, reason, sentAt: status === 'sent' ? new Date() : null }).where(and(eq(reminderLogs.organisationId, org), eq(reminderLogs.id, id))); }
export async function deliveryActor(tx: Database, org: string) { const [actor] = await tx.select({ userId: organisationMemberships.userId }).from(organisationMemberships).where(and(eq(organisationMemberships.organisationId, org), isNull(organisationMemberships.removedAt), inArray(organisationMemberships.role, ['owner', 'admin', 'accountant']))).limit(1); return actor?.userId; }

export async function isDeliveryActor(tx:Database,org:string,userId:string){const [actor]=await tx.select({userId:organisationMemberships.userId}).from(organisationMemberships).where(and(eq(organisationMemberships.organisationId,org),eq(organisationMemberships.userId,userId),isNull(organisationMemberships.removedAt),inArray(organisationMemberships.role,['owner','admin','accountant']))).limit(1);return !!actor;}
