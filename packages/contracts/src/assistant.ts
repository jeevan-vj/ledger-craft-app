import { z } from 'zod';
import { invoiceLineTaxSchema } from './invoice';
import { salesTaxCodeSchema } from './sales-tax-code';

const money = z.string().regex(/^\d+(\.\d+)?$/);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const gstRate = invoiceLineTaxSchema.shape.rate;

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const dayOfMonth = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, dayOfMonth));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === dayOfMonth;
}

const calendarDay = day.refine(isCalendarDate, 'Enter a real date');

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
  taxCode: salesTaxCodeSchema.optional(),
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
  issueDate: calendarDay.optional(),
  dueDate: calendarDay.optional(),
  taxInclusive: z.boolean().optional(),
  taxRate: gstRate.optional(),
  notes: z.string().max(1000).nullable().optional(),
  lines: z.array(z.object({
    description: z.string().trim().min(1).max(200),
    quantity: money,
    rate: money,
    unit: z.string().min(1).max(20).nullable().optional(),
    itemId: z.string().uuid().nullable().optional(),
    taxRate: gstRate.optional(),
    taxCode: salesTaxCodeSchema.optional(),
  }).strict()).min(1).max(20).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.issueDate && value.dueDate && value.dueDate < value.issueDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Due date can't be before the invoice date",
      path: ['dueDate'],
    });
  }
});

export const saveAssistantDraftRequestSchema = z.object({
  conversationId: z.string().uuid(),
  proposalId: z.string().uuid(),
  edits: saveAssistantDraftEditsSchema.optional(),
}).strict();

export const previewAssistantProposalRequestSchema = z.object({
  conversationId: z.string().uuid(),
  edits: saveAssistantDraftEditsSchema.optional(),
}).strict();

export const previewAssistantProposalResponseSchema = z.object({
  proposalId: z.string().uuid(),
  date: calendarDay,
  dueDate: calendarDay.nullable(),
  taxInclusive: z.boolean().nullable(),
  taxRate: z.string().regex(/^\d+(\.\d+)?$/),
  lines: z.array(z.object({
    description: z.string().min(1).max(200),
    quantity: money,
    rate: money.nullable(),
    taxRate: z.string().regex(/^\d+(\.\d+)?$/),
    tax: money.nullable(),
    total: money.nullable(),
  }).strict()).max(20),
  subtotal: money.nullable(),
  taxAmount: money.nullable(),
  total: money.nullable(),
  errors: z.array(z.object({
    field: z.string().min(1).max(80),
    message: z.string().min(1).max(200),
  }).strict()).max(40),
}).strict();

export type AssistantPart = z.infer<typeof assistantPartSchema>;
export type AssistantProposal = z.infer<typeof assistantProposalSchema>;
export type AssistantTurnRequest = z.infer<typeof assistantTurnRequestSchema>;
export type AssistantTurnResponse = z.infer<typeof assistantTurnResponseSchema>;
export type SaveAssistantDraftRequest = z.infer<typeof saveAssistantDraftRequestSchema>;
export type PreviewAssistantProposalRequest = z.infer<typeof previewAssistantProposalRequestSchema>;
export type PreviewAssistantProposalResponse = z.infer<typeof previewAssistantProposalResponseSchema>;
