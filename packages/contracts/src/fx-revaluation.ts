import { z } from 'zod';
const money = z.string().regex(/^-?\d+\.\d{2}$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Choose a valid calendar date');
const request = z.object({
  asOfDate: date,
  exchangeRateIds: z.array(z.string().uuid()).min(1).max(100).refine(ids => new Set(ids).size === ids.length, 'Choose each reviewed rate once'),
  reason: z.string().trim().min(3).max(500),
});
export const fxRevaluationPreviewRequestSchema = request.strict();
export const fxRevaluationRequestSchema = request.extend({ reviewed: z.literal(true) }).strict();
export const fxRevaluationResponseSchema = z.object({
  asOfDate: date,
  reversalDate: date,
  baseCurrency: z.literal('NZD'),
  positions: z.array(z.object({
    documentType: z.enum(['invoice', 'bill']), documentId: z.string().uuid(), documentNumber: z.string(),
    currency: z.string(), foreignOutstanding: money, bookBaseAmount: money, revaluedBaseAmount: money,
    exchangeDifference: money, exchangeRateId: z.string().uuid(), exchangeRate: z.string(),
  }).strict()),
  unrealizedGain: money, unrealizedLoss: money,
  warnings: z.array(z.string()), journalEntryIds: z.array(z.string().uuid()), reversalJournalEntryIds: z.array(z.string().uuid()), replayed: z.boolean(),
}).strict();
export type FxRevaluationPreviewRequest = z.infer<typeof fxRevaluationPreviewRequestSchema>;
export type FxRevaluationRequest = z.infer<typeof fxRevaluationRequestSchema>;
export type FxRevaluationResponse = z.infer<typeof fxRevaluationResponseSchema>;
