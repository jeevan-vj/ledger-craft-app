import {
  conversationSchema,
  type AddConversationMessageRequest,
  type ConversationDto,
  type CreateConversationRequest,
  type UpdateConversationRequest,
} from '@ledgercraft/contracts';
import { and, desc, eq } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { conversationMessages, conversations } from '../../db/schema/conversations';

function toDto(
  row: typeof conversations.$inferSelect,
  messages: Array<typeof conversationMessages.$inferSelect>,
): ConversationDto {
  return conversationSchema.parse({
    id: row.id,
    title: row.title ?? null,
    status: row.status,
    context: row.context ?? null,
    messages: messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      metadata: message.metadata ?? null,
      createdAt: message.createdAt.toISOString(),
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export async function listConversations(tx: Database, organisationId: string): Promise<ConversationDto[]> {
  const rows = await tx
    .select()
    .from(conversations)
    .where(eq(conversations.organisationId, organisationId))
    .orderBy(desc(conversations.updatedAt));
  const result: ConversationDto[] = [];
  for (const row of rows) {
    const messages = await tx
      .select()
      .from(conversationMessages)
      .where(and(eq(conversationMessages.conversationId, row.id), eq(conversationMessages.organisationId, organisationId)))
      .orderBy(conversationMessages.createdAt);
    result.push(toDto(row, messages));
  }
  return result;
}

export async function getConversation(
  tx: Database,
  organisationId: string,
  id: string,
): Promise<ConversationDto | undefined> {
  const [row] = await tx
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.organisationId, organisationId)));
  if (!row) return undefined;
  const messages = await tx
    .select()
    .from(conversationMessages)
    .where(and(eq(conversationMessages.conversationId, row.id), eq(conversationMessages.organisationId, organisationId)))
    .orderBy(conversationMessages.createdAt);
  return toDto(row, messages);
}

export async function insertConversation(
  tx: Database,
  ctx: { organisationId: string; userId: string },
  input: CreateConversationRequest,
): Promise<ConversationDto> {
  const [row] = await tx
    .insert(conversations)
    .values({
      organisationId: ctx.organisationId,
      userId: ctx.userId,
      title: input.title ?? null,
      context: (input.context as Record<string, unknown> | undefined) ?? null,
      status: 'active',
    })
    .returning();
  return toDto(row, []);
}

export async function insertMessage(
  tx: Database,
  ctx: { organisationId: string },
  conversationId: string,
  input: AddConversationMessageRequest,
): Promise<ConversationDto | undefined> {
  await tx.insert(conversationMessages).values({
    organisationId: ctx.organisationId,
    conversationId,
    role: input.role,
    content: input.content,
    metadata: (input.metadata as Record<string, unknown> | undefined) ?? null,
  });
  await tx
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(and(eq(conversations.id, conversationId), eq(conversations.organisationId, ctx.organisationId)));
  return getConversation(tx, ctx.organisationId, conversationId);
}

export async function updateConversation(
  tx: Database,
  organisationId: string,
  id: string,
  input: UpdateConversationRequest,
): Promise<ConversationDto | undefined> {
  const existing = await getConversation(tx, organisationId, id);
  if (!existing) return undefined;
  const values: Partial<typeof conversations.$inferInsert> = { updatedAt: new Date() };
  if (input.title !== undefined) values.title = input.title;
  if (input.status !== undefined) values.status = input.status;
  if (input.context !== undefined) {
    values.context = (input.context as Record<string, unknown> | null) ?? null;
  }
  await tx
    .update(conversations)
    .set(values)
    .where(and(eq(conversations.id, id), eq(conversations.organisationId, organisationId)));
  return getConversation(tx, organisationId, id);
}

export async function deleteConversation(tx: Database, organisationId: string, id: string): Promise<boolean> {
  const deleted = await tx
    .delete(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.organisationId, organisationId)))
    .returning({ id: conversations.id });
  return deleted.length > 0;
}
