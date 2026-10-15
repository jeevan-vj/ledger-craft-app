import {
  conversationListResponseSchema,
  type AddConversationMessageRequest,
  type ConversationDto,
  type ConversationListResponse,
  type CreateConversationRequest,
  type UpdateConversationRequest,
} from '@ledgercraft/contracts';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import { withOrganisationTx } from '../auth/bind-organisation';
import * as repo from './conversations.repository';

export async function listConversationsForUser(db: Database, userId: string): Promise<ConversationListResponse> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const conversations = await repo.listConversations(tx, ctx.organisationId);
    return conversationListResponseSchema.parse({ conversations });
  });
}

export async function getConversationForUser(db: Database, userId: string, id: string): Promise<ConversationDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const conversation = await repo.getConversation(tx, ctx.organisationId, id);
    if (!conversation) throw new HTTPException(404, { message: 'Conversation not found' });
    return conversation;
  });
}

export async function createConversationForUser(
  db: Database,
  userId: string,
  input: CreateConversationRequest,
): Promise<ConversationDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => repo.insertConversation(tx, ctx, input));
}

export async function addMessageForUser(
  db: Database,
  userId: string,
  id: string,
  input: AddConversationMessageRequest,
): Promise<ConversationDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const existing = await repo.getConversation(tx, ctx.organisationId, id);
    if (!existing) throw new HTTPException(404, { message: 'Conversation not found' });
    const updated = await repo.insertMessage(tx, ctx, id, input);
    if (!updated) throw new HTTPException(404, { message: 'Conversation not found' });
    return updated;
  });
}

export async function updateConversationForUser(
  db: Database,
  userId: string,
  id: string,
  input: UpdateConversationRequest,
): Promise<ConversationDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const updated = await repo.updateConversation(tx, ctx.organisationId, id, input);
    if (!updated) throw new HTTPException(404, { message: 'Conversation not found' });
    return updated;
  });
}

export async function deleteConversationForUser(db: Database, userId: string, id: string): Promise<void> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const deleted = await repo.deleteConversation(tx, ctx.organisationId, id);
    if (!deleted) throw new HTTPException(404, { message: 'Conversation not found' });
  });
}
