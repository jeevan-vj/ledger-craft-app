import type {
  CreateShareQuoteRequest,
  PublicQuoteResponse,
  PublicSharedQuote,
  QuoteDto,
  RespondToQuoteRequest,
  ShareQuoteResponse,
} from '@ledgercraft/contracts';
import {
  publicQuoteResponseSchema,
  publicSharedQuoteSchema,
  shareQuoteResponseSchema,
} from '@ledgercraft/contracts';
import { HTTPException } from 'hono/http-exception';
import { apiError } from '../../http-error';
import type { Database } from '../../db/client';
import { withOrganisationTx } from '../auth/bind-organisation';
import * as profileRepo from '../business-profile/business-profile.repository';
import * as quotesRepo from './quotes.repository';
import { assertQuoteTransition, aucklandToday } from './quotes.transitions';

const SHARE_TOKEN = /^([0-9a-f-]{36})_[0-9a-f-]{36}$/;

export class QuoteAlreadyRespondedError extends Error {
  readonly response: PublicQuoteResponse;
  constructor(response: PublicQuoteResponse) {
    super('This quote has already been answered');
    this.name = 'QuoteAlreadyRespondedError';
    this.response = response;
  }
}

function parseExpiry(value: string | null | undefined): Date | null {
  if (value == null || value === '') return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw apiError(400, 'VALIDATION_ERROR', 'expiresAt must be an ISO date');
  return parsed;
}

function organisationIdFromToken(token: string): string {
  const organisationId = SHARE_TOKEN.exec(token)?.[1];
  if (!organisationId) throw new HTTPException(404, { message: 'Quote not found' });
  return organisationId;
}

function existingResponse(quote: QuoteDto): PublicQuoteResponse {
  return publicQuoteResponseSchema.parse({
    action: quote.status === 'declined' ? 'decline' : 'accept',
    name: quote.respondedByName,
    note: quote.responseNote,
    respondedAt: quote.respondedAt,
    acceptedRevision: quote.acceptedRevision,
  });
}

async function loadShare(tx: Database, token: string) {
  const organisationId = organisationIdFromToken(token);
  const share = await quotesRepo.findQuoteShare(tx, organisationId, token);
  if (!share) throw new HTTPException(404, { message: 'Quote not found' });
  const quote = await quotesRepo.getQuote(tx, organisationId, share.quoteId, aucklandToday());
  if (!quote) throw new HTTPException(404, { message: 'Quote not found' });
  const shareExpired = share.expiresAt != null && share.expiresAt.getTime() <= Date.now();
  if (!share.isActive || share.revision !== quote.revision || shareExpired) {
    throw apiError(410, 'QUOTE_LINK_REVOKED', 'This link is no longer valid');
  }
  return { share, quote, organisationId };
}

export async function createShareForUser(
  db: Database,
  userId: string,
  quoteId: string,
  input: CreateShareQuoteRequest,
): Promise<ShareQuoteResponse> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    let quote = await quotesRepo.getQuote(tx, ctx.organisationId, quoteId, aucklandToday());
    if (!quote) throw new HTTPException(404, { message: 'Quote not found' });
    const profile = await profileRepo.getBusinessProfile(tx, ctx.organisationId);
    if (!profile) throw new HTTPException(400, { message: 'Set up your business profile first' });
    if (quote.status === 'draft') {
      assertQuoteTransition(quote.status, 'sent');
      await quotesRepo.setQuoteStatus(tx, ctx.organisationId, quoteId, { status: 'sent', sentAt: new Date() });
      quote = await quotesRepo.getQuote(tx, ctx.organisationId, quoteId, aucklandToday());
      if (!quote) throw new HTTPException(404, { message: 'Quote not found' });
    }
    const expiresAt = parseExpiry(input.expiresAt);
    const shareToken = `${ctx.organisationId}_${crypto.randomUUID()}`;
    const templateName = input.templateName ?? quote.templateName ?? 'classic';
    await quotesRepo.insertQuoteShare(tx, ctx, {
      quoteId: quote.id,
      quote,
      templateName,
      businessProfile: profile,
      shareToken,
      revision: quote.revision,
      expiresAt,
    });
    return shareQuoteResponseSchema.parse({
      shareToken,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      isActive: true,
      revision: quote.revision,
    });
  });
}

function present(quote: QuoteDto, templateData: { templateName?: string; businessProfile?: unknown }): PublicSharedQuote {
  return publicSharedQuoteSchema.parse({
    quote: {
      ...quote,
      status: quote.status,
    },
    templateName: templateData.templateName ?? quote.templateName ?? 'classic',
    businessProfile: templateData.businessProfile,
    status: quote.status,
    expiryDate: quote.expiryDate,
    respondedByName: quote.respondedByName,
    responseNote: quote.responseNote,
    respondedAt: quote.respondedAt,
  });
}

export async function getPublicSharedQuote(db: Database, token: string): Promise<PublicSharedQuote> {
  return db.transaction(async (tx) => {
    const { share, quote, organisationId } = await loadShare(tx, token);
    await quotesRepo.incrementQuoteShareAccess(tx, organisationId, share.id);
    let live = quote;
    if (quote.status === 'sent') {
      live = (await quotesRepo.setQuoteStatus(tx, organisationId, quote.id, {
        status: 'viewed',
        publicViewedAt: quote.publicViewedAt ? new Date(quote.publicViewedAt) : new Date(),
      })) ?? quote;
    }
    const templateData = (share.templateData ?? {}) as { templateName?: string; businessProfile?: unknown };
    return present(live, templateData);
  });
}

export async function respondToPublicQuote(
  db: Database,
  token: string,
  input: RespondToQuoteRequest,
): Promise<PublicQuoteResponse> {
  return db.transaction(async (tx) => {
    const { quote, organisationId } = await loadShare(tx, token);
    if (quote.respondedAt || quote.status === 'accepted' || quote.status === 'declined' || quote.status === 'converted') {
      throw new QuoteAlreadyRespondedError(existingResponse(quote));
    }
    if (quote.status === 'expired') {
      throw apiError(409, 'QUOTE_EXPIRED', `This quote expired on ${quote.expiryDate}`);
    }
    const status = input.action === 'accept' ? 'accepted' : 'declined';
    assertQuoteTransition(quote.status, status);
    const updated = await quotesRepo.setQuoteStatus(tx, organisationId, quote.id, {
      status,
      respondedAt: new Date(),
      respondedByName: input.name.trim(),
      responseNote: input.note?.trim() ? input.note.trim() : null,
      acceptedRevision: status === 'accepted' ? quote.revision : null,
    });
    if (!updated) throw new HTTPException(404, { message: 'Quote not found' });
    return existingResponse(updated);
  });
}
