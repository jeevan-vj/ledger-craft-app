import {
  publicSharedInvoiceSchema,
  shareInvoiceResponseSchema,
  type CreateShareInvoiceRequest,
  type PublicSharedInvoice,
  type ShareInvoiceResponse,
} from '@ledgercraft/contracts';
import { and, eq, gt, isNull, or } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import { sharedInvoices } from '../../db/schema/shared-invoices';
import { apiError } from '../../http-error';
import { withOrganisationTx } from '../auth/bind-organisation';
import * as profileRepo from '../business-profile/business-profile.repository';
import * as invoicesRepo from './invoices.repository';

function parseExpiry(value: string | null | undefined): Date | null {
  if (value == null || value === '') return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw apiError(400, 'VALIDATION_ERROR', 'expiresAt must be an ISO date');
  }
  return parsed;
}

export async function createShareForUser(
  db: Database,
  userId: string,
  invoiceId: string,
  input: CreateShareInvoiceRequest,
): Promise<ShareInvoiceResponse> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const invoice = await invoicesRepo.getInvoice(tx, ctx.organisationId, invoiceId);
    if (!invoice) throw new HTTPException(404, { message: 'Invoice not found' });

    const profile = await profileRepo.getBusinessProfile(tx, ctx.organisationId);
    if (!profile) {
      throw new HTTPException(400, { message: 'Set up your business profile first' });
    }

    const expiresAt = parseExpiry(input.expiresAt);
    const shareToken = `${ctx.organisationId}_${crypto.randomUUID()}`;
    const templateName = input.templateName ?? 'classic';
    const attachments = await invoicesRepo.listAttachments(tx, ctx.organisationId, invoice.id);

    await tx.insert(sharedInvoices).values({
      organisationId: ctx.organisationId,
      originalInvoiceId: invoice.id,
      invoiceData: invoice,
      templateData: { templateName, businessProfile: profile, attachments },
      attachmentIds: attachments.map((attachment) => attachment.id),
      shareToken,
      expiresAt,
      createdBy: ctx.userId,
    });

    return shareInvoiceResponseSchema.parse({
      shareToken,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      isActive: true,
    });
  });
}

export async function getPublicSharedInvoice(
  db: Database,
  token: string,
): Promise<PublicSharedInvoice> {
  const organisationId = token.split('_')[0];
  const [row] = await db.select().from(sharedInvoices).where(and(
    eq(sharedInvoices.organisationId, organisationId),
    eq(sharedInvoices.shareToken, token),
    eq(sharedInvoices.isActive, true),
    or(isNull(sharedInvoices.expiresAt), gt(sharedInvoices.expiresAt, new Date())),
  )).limit(1);
  if (!row) throw new HTTPException(404, { message: 'Invoice not found' });

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
  if (!attachment) throw new HTTPException(404, { message: 'Attachment not found' });
  return attachment;
}
