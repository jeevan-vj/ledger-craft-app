import {
  invoiceShareListResponseSchema,
  publicSharedInvoiceSchema,
  revokeInvoiceSharesResponseSchema,
  shareInvoiceResponseSchema,
  type CreateShareInvoiceRequest,
  type InvoiceShareListResponse,
  type PublicSharedInvoice,
  type RevokeInvoiceSharesResponse,
  type ShareInvoiceResponse,
} from '@ledgercraft/contracts';
import { and, desc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import { sharedInvoices } from '../../db/schema/shared-invoices';
import { apiError } from '../../http-error';
import { withOrganisationTx } from '../auth/bind-organisation';
import * as profileRepo from '../business-profile/business-profile.repository';
import * as invoicesRepo from './invoices.repository';

type ShareRow = typeof sharedInvoices.$inferSelect;

function parseExpiry(value: string | null | undefined): Date | null {
  if (value == null || value === '') return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw apiError(400, 'VALIDATION_ERROR', 'expiresAt must be an ISO date');
  }
  return parsed;
}

function templateNameOf(row: ShareRow): string {
  const templateData = (row.templateData ?? {}) as { templateName?: string };
  return templateData.templateName?.trim() || 'classic';
}

function presentShare(row: ShareRow): ShareInvoiceResponse {
  return shareInvoiceResponseSchema.parse({
    shareToken: row.shareToken,
    templateName: templateNameOf(row),
    expiresAt: row.expiresAt ? new Date(row.expiresAt).toISOString() : null,
    isActive: row.isActive,
    accessCount: row.accessCount,
    createdAt: new Date(row.createdAt).toISOString(),
  });
}

function activeShareWhere(organisationId: string, invoiceId: string, now: Date) {
  return and(
    eq(sharedInvoices.organisationId, organisationId),
    eq(sharedInvoices.originalInvoiceId, invoiceId),
    eq(sharedInvoices.isActive, true),
    or(isNull(sharedInvoices.expiresAt), gt(sharedInvoices.expiresAt, now)),
  );
}

async function listActiveShares(tx: Database, organisationId: string, invoiceId: string, now: Date) {
  return tx
    .select()
    .from(sharedInvoices)
    .where(activeShareWhere(organisationId, invoiceId, now))
    .orderBy(desc(sharedInvoices.createdAt), desc(sharedInvoices.id));
}

async function requireInvoice(tx: Database, organisationId: string, invoiceId: string) {
  const invoice = await invoicesRepo.getInvoice(tx, organisationId, invoiceId);
  if (!invoice) throw new HTTPException(404, { message: 'Invoice not found' });
  return invoice;
}

export async function listSharesForUser(
  db: Database,
  userId: string,
  invoiceId: string,
): Promise<InvoiceShareListResponse> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    await requireInvoice(tx, ctx.organisationId, invoiceId);
    const rows = await listActiveShares(tx, ctx.organisationId, invoiceId, new Date());
    return invoiceShareListResponseSchema.parse({ shares: rows.map(presentShare) });
  });
}

export async function revokeSharesForUser(
  db: Database,
  userId: string,
  invoiceId: string,
): Promise<RevokeInvoiceSharesResponse> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    await requireInvoice(tx, ctx.organisationId, invoiceId);
    const revoked = await tx
      .update(sharedInvoices)
      .set({ isActive: false })
      .where(and(
        eq(sharedInvoices.organisationId, ctx.organisationId),
        eq(sharedInvoices.originalInvoiceId, invoiceId),
        eq(sharedInvoices.isActive, true),
      ))
      .returning({ id: sharedInvoices.id });
    return revokeInvoiceSharesResponseSchema.parse({ revoked: revoked.length });
  });
}

export async function createShareForUser(
  db: Database,
  userId: string,
  invoiceId: string,
  input: CreateShareInvoiceRequest,
): Promise<{ share: ShareInvoiceResponse; created: boolean }> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const invoice = await requireInvoice(tx, ctx.organisationId, invoiceId);
    const profile = await profileRepo.getBusinessProfile(tx, ctx.organisationId);
    if (!profile) {
      throw new HTTPException(400, { message: 'Set up your business profile first' });
    }

    const templateName = input.templateName ?? 'classic';
    const now = new Date();
    if (!input.replace) {
      const existing = (await listActiveShares(tx, ctx.organisationId, invoice.id, now))
        .find((row) => templateNameOf(row) === templateName);
      if (existing) return { share: presentShare(existing), created: false };
    }

    const expiresAt = parseExpiry(input.expiresAt);
    if (input.replace) {
      await tx
        .update(sharedInvoices)
        .set({ isActive: false })
        .where(and(
          eq(sharedInvoices.organisationId, ctx.organisationId),
          eq(sharedInvoices.originalInvoiceId, invoice.id),
          eq(sharedInvoices.isActive, true),
        ));
    }

    const shareToken = `${ctx.organisationId}_${crypto.randomUUID()}`;
    const attachments = (await invoicesRepo.listAttachments(tx, ctx.organisationId, invoice.id))
      .filter((attachment) => attachment.role !== 'source_document');
    const [row] = await tx.insert(sharedInvoices).values({
      organisationId: ctx.organisationId,
      originalInvoiceId: invoice.id,
      invoiceData: invoice,
      templateData: { templateName, businessProfile: profile, attachments },
      attachmentIds: attachments.map((attachment) => attachment.id),
      shareToken,
      expiresAt,
      accessCount: 0,
      isActive: true,
      createdBy: ctx.userId,
      createdAt: now,
    }).returning();
    if (!row) throw new HTTPException(500, { message: 'Share was not created' });
    return { share: presentShare(row), created: true };
  });
}

export async function getPublicSharedInvoice(
  db: Database,
  token: string,
): Promise<PublicSharedInvoice> {
  const organisationId = token.split('_')[0] ?? '';
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(sharedInvoices).where(and(
      eq(sharedInvoices.organisationId, organisationId),
      eq(sharedInvoices.shareToken, token),
    )).limit(1);
    if (!row) throw new HTTPException(404, { message: 'Invoice not found' });
    const expired = row.expiresAt != null && row.expiresAt.getTime() <= Date.now();
    if (!row.isActive || expired) {
      throw apiError(410, 'SHARE_INACTIVE', 'This link is no longer active');
    }
    await tx.update(sharedInvoices).set({
      accessCount: sql`${sharedInvoices.accessCount} + 1`,
    }).where(and(
      eq(sharedInvoices.organisationId, organisationId),
      eq(sharedInvoices.id, row.id),
    ));

    const templateData = (row.templateData ?? {}) as {
      templateName?: string;
      businessProfile?: unknown;
      attachments?: unknown;
    };
    return publicSharedInvoiceSchema.parse({
      invoice: row.invoiceData,
      templateName: templateData.templateName ?? 'classic',
      businessProfile: templateData.businessProfile,
      attachments: templateData.attachments ?? [],
    });
  });
}

export async function getPublicSharedAttachment(
  db: Database,
  token: string,
  attachmentId: string,
) {
  const organisationId = token.split('_')[0];
  const [share] = await db.select().from(sharedInvoices).where(and(
    eq(sharedInvoices.organisationId, organisationId), eq(sharedInvoices.shareToken, token),
    eq(sharedInvoices.isActive, true), or(isNull(sharedInvoices.expiresAt), gt(sharedInvoices.expiresAt, new Date())),
  )).limit(1);
  const ids = (share?.attachmentIds ?? []) as string[];
  if (!share || !ids.includes(attachmentId)) throw new HTTPException(404, { message: 'Attachment not found' });
  const attachment = await invoicesRepo.getAttachment(db, organisationId, share.originalInvoiceId, attachmentId);
  if (!attachment || attachment.role === 'source_document') throw new HTTPException(404, { message: 'Attachment not found' });
  return attachment;
}
