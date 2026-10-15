import { z } from 'zod';

export const conversationStatusSchema = z.enum(['active', 'completed', 'paused']);
export const conversationRoleSchema = z.enum(['user', 'assistant', 'system']);

export const conversationMessageSchema = z.object({
  id: z.string().uuid(),
  role: conversationRoleSchema,
  content: z.string(),
  metadata: z.unknown().nullable(),
  createdAt: z.string().min(1),
});

export const conversationSchema = z.object({
  id: z.string().uuid(),
  title: z.string().nullable(),
  status: conversationStatusSchema,
  context: z.unknown().nullable(),
  messages: z.array(conversationMessageSchema),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const conversationListResponseSchema = z.object({
  conversations: z.array(conversationSchema),
});

export const createConversationRequestSchema = z
  .object({
    title: z.string().min(1).optional(),
    context: z.unknown().optional(),
  })
  .strict();

export const addConversationMessageRequestSchema = z
  .object({
    role: conversationRoleSchema,
    content: z.string().min(1),
    metadata: z.unknown().optional(),
  })
  .strict();

export const updateConversationRequestSchema = z
  .object({
    title: z.string().min(1).optional(),
    status: conversationStatusSchema.optional(),
    context: z.unknown().optional(),
  })
  .strict();

export type ConversationDto = z.infer<typeof conversationSchema>;
export type ConversationMessageDto = z.infer<typeof conversationMessageSchema>;
export type ConversationListResponse = z.infer<typeof conversationListResponseSchema>;
export type CreateConversationRequest = z.infer<typeof createConversationRequestSchema>;
export type AddConversationMessageRequest = z.infer<typeof addConversationMessageRequestSchema>;
export type UpdateConversationRequest = z.infer<typeof updateConversationRequestSchema>;
