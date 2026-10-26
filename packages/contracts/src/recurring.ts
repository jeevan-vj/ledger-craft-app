import { z } from 'zod';
import { createInvoiceRequestSchema } from './invoice';
import { createBillRequestSchema } from './purchase';
import { createExpenseRequestSchema } from './expense';
import { createBankTransactionRequestSchema } from './bank';

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeOnly = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const recurringKindSchema = z.enum(['invoice', 'bill', 'income', 'expense']);
export const recurringFrequencySchema = z.enum(['daily', 'weekly', 'monthly', 'annual', 'custom']);
export const recurringStatusSchema = z.enum(['active', 'paused', 'ended']);
export const recurringRunStatusSchema = z.enum(['running', 'succeeded', 'failed']);
export const recurringCustomUnitSchema = z.enum(['day', 'week', 'month', 'year']);
export const recurringDayOfMonthSchema = z.union([z.number().int().min(1).max(31), z.literal('last')]);

const recurringInvoiceSendSchema = z.object({
  mode: z.enum(['draft', 'auto']).default('draft'),
  whenEmailUnavailable: z.enum(['draft', 'mark_sent']).optional(),
}).strict();

export const recurringPayloadSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('invoice'), input: createInvoiceRequestSchema, send: recurringInvoiceSendSchema.optional() }),
  z.object({ kind: z.literal('bill'), input: createBillRequestSchema }),
  z.object({ kind: z.literal('expense'), input: createExpenseRequestSchema }),
  z.object({ kind: z.literal('income'), input: createBankTransactionRequestSchema.extend({ type: z.literal('credit') }) }),
]);

export const recurringScheduleSchema = z.object({
  frequency: recurringFrequencySchema,
  interval: z.number().int().min(1).max(365).default(1),
  customUnit: recurringCustomUnitSchema.nullable().optional(),
  startDate: dateOnly,
  endDate: dateOnly.nullable().optional(),
  occurrenceLimit: z.number().int().min(1).max(10_000).nullable().optional(),
  timezone: z.string().min(1).max(100),
  localTime: timeOnly.default('09:00'),
  dayOfMonth: recurringDayOfMonthSchema.optional(),
}).superRefine((value, ctx) => {
  if (value.frequency === 'custom' && !value.customUnit) ctx.addIssue({ code: 'custom', path: ['customUnit'], message: 'Custom unit is required' });
  if (value.endDate && value.endDate < value.startDate) ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'End date cannot precede start date' });
  try { new Intl.DateTimeFormat('en', { timeZone: value.timezone }).format(); } catch { ctx.addIssue({ code: 'custom', path: ['timezone'], message: 'Invalid timezone' }); }
});

export const createRecurringTemplateRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  payload: recurringPayloadSchema,
  schedule: recurringScheduleSchema,
  sourceInvoiceId: z.string().uuid().nullable().optional(),
}).strict();
export const updateRecurringTemplateRequestSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  payload: recurringPayloadSchema.optional(),
  schedule: recurringScheduleSchema.optional(),
  sourceInvoiceId: z.string().uuid().nullable().optional(),
}).strict();

export const recurringTemplateSchema = z.object({
  id: z.string().uuid(), name: z.string(), kind: recurringKindSchema, status: recurringStatusSchema,
  payload: recurringPayloadSchema, schedule: recurringScheduleSchema,
  sourceInvoiceId: z.string().uuid().nullable().optional(),
  nextRunAt: z.string().datetime().nullable(), lastRunAt: z.string().datetime().nullable(),
  occurrencesCreated: z.number().int().nonnegative(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
});
export const recurringRunSchema = z.object({
  id: z.string().uuid(), templateId: z.string().uuid(), occurrenceKey: z.string(), scheduledFor: z.string().datetime(),
  status: recurringRunStatusSchema, attemptCount: z.number().int().positive(), generatedType: recurringKindSchema,
  generatedId: z.string().uuid().nullable(), deliveryStatus: z.enum(['not_requested', 'unavailable', 'sent', 'email_not_configured', 'failed']),
  deliveryMessage: z.string().nullable().default(null),
  failureReason: z.string().nullable(), nextAttemptAt: z.string().datetime().nullable(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
});
export const recurringTemplateListResponseSchema = z.object({ templates: z.array(recurringTemplateSchema) });
export const recurringRunListResponseSchema = z.object({ runs: z.array(recurringRunSchema) });
export const runRecurringDueRequestSchema = z.object({ now: z.string().datetime().optional(), limit: z.number().int().min(1).max(100).default(25) }).strict();
export const runRecurringDueResponseSchema = z.object({ claimed: z.number().int().nonnegative(), succeeded: z.number().int().nonnegative(), failed: z.number().int().nonnegative(), nextAlarmAt: z.string().datetime().nullable() });
export const recurringPreviewRequestSchema = z.object({
  schedule: recurringScheduleSchema,
  count: z.number().int().min(1).max(12).default(5),
}).strict();
export const recurringPreviewResponseSchema = z.object({
  occurrences: z.array(z.object({ runAt: z.string().datetime(), localDate: dateOnly })),
});

export type RecurringKind = z.infer<typeof recurringKindSchema>;
export type RecurringPayload = z.infer<typeof recurringPayloadSchema>;
export type RecurringSchedule = z.infer<typeof recurringScheduleSchema>;
export type RecurringTemplateDto = z.infer<typeof recurringTemplateSchema>;
export type RecurringRunDto = z.infer<typeof recurringRunSchema>;
export type CreateRecurringTemplateRequest = z.infer<typeof createRecurringTemplateRequestSchema>;
export type UpdateRecurringTemplateRequest = z.infer<typeof updateRecurringTemplateRequestSchema>;
export type RunRecurringDueRequest = z.infer<typeof runRecurringDueRequestSchema>;
export type RunRecurringDueResponse = z.infer<typeof runRecurringDueResponseSchema>;
export type RecurringPreviewRequest = z.infer<typeof recurringPreviewRequestSchema>;
export type RecurringPreviewResponse = z.infer<typeof recurringPreviewResponseSchema>;
