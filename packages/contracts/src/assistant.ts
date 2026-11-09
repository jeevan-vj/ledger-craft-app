import { z } from 'zod';

const money = z.string().regex(/^\d+(\.\d+)?$/);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const assistantQuickPickSchema = z.object({
  type: z.literal('quick_picks'),
  field: z.enum(['customerId', 'itemId']),
  prompt: z.string().min(1).max(200),
  options: z.array(z.object({
    id: z.string().uuid(),
    label: z.string().min(1).max(200),
  }).strict()).max(8),
}).strict();

export const assistantLinkSchema = z.object({
  type: z.literal('link'),
  href: z.string().regex(/^\/[a-z0-9/-]*$/),
  label: z.string().min(1).max(80),
}).strict();

export const assistantTextSchema = z.object({
  type: z.literal('text'),
  text: z.string().min(1).max(500),
}).strict();

export const assistantProposalLineSchema = z.object({
  description: z.string().min(1).max(200),
  quantity: z.string().regex(/^\d+(\.\d+)?$/),
  rate: money.nullable(),
  unit: z.string().min(1).max(20).nullable(),
  itemId: z.string().uuid().nullable(),
  missing: z.array(z.string().min(1).max(40)).max(5),
}).strict();

export const assistantProposalSchema = z.object({
  id: z.string().uuid(),
  kind: z.literal('invoice'),
  status: z.enum(['ready', 'needs_input']),
  customerId: z.string().uuid().nullable(),
  customerName: z.string().min(1).max(200).nullable(),
  date: day,
  dueDate: day.nullable(),
  taxInclusive: z.boolean().nullable(),
  taxRate: z.string().regex(/^\d+(\.\d+)?$/),
  currency: z.string().regex(/^[A-Z]{3}$/),
  notes: z.string().max(1000).nullable(),
  lines: z.array(assistantProposalLineSchema).min(1).max(20),
  missing: z.array(z.string().min(1).max(40)).max(20),
  totals: z.object({
    subtotal: money,
    taxAmount: money,
    total: money,
  }).strict().nullable(),
  actions: z.object({
    saveDraft: z.literal(true),
    send: z.literal(false),
  }).strict(),
}).strict();

export const assistantProposalPartSchema = z.object({
  type: z.literal('proposal'),
  proposal: assistantProposalSchema,
}).strict();

export const assistantPartSchema = z.discriminatedUnion('type', [
  assistantTextSchema,
  assistantQuickPickSchema,
  assistantLinkSchema,
  assistantProposalPartSchema,
]);

export const assistantTurnRequestSchema = z.object({
  conversationId: z.string().uuid().optional(),
  message: z.string().trim().min(1).max(2_000),
}).strict();

export const assistantTurnResponseSchema = z.object({
  conversationId: z.string().uuid(),
  parts: z.array(assistantPartSchema).min(1).max(30),
}).strict();

export const saveAssistantDraftEditsSchema = z.object({
  customerId: z.string().uuid().optional(),
  dueDate: day.optional(),
  taxInclusive: z.boolean().optional(),
  notes: z.string().max(1000).nullable().optional(),
  lines: z.array(z.object({
    description: z.string().trim().min(1).max(200),
    quantity: money,
    rate: money,
    unit: z.string().min(1).max(20).nullable().optional(),
    itemId: z.string().uuid().nullable().optional(),
  }).strict()).min(1).max(20).optional(),
}).strict();

export const saveAssistantDraftRequestSchema = z.object({
  conversationId: z.string().uuid(),
  proposalId: z.string().uuid(),
  edits: saveAssistantDraftEditsSchema.optional(),
}).strict();

export type AssistantPart = z.infer<typeof assistantPartSchema>;
export type AssistantProposal = z.infer<typeof assistantProposalSchema>;
export type AssistantTurnRequest = z.infer<typeof assistantTurnRequestSchema>;
export type AssistantTurnResponse = z.infer<typeof assistantTurnResponseSchema>;
export type SaveAssistantDraftRequest = z.infer<typeof saveAssistantDraftRequestSchema>;
