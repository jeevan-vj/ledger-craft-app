import { z } from 'zod';
import { gstDateSchema } from './gst-settings';

/** Unfiltered canonical statements; at most one financial year per archive. */
export const closePackQuerySchema = z.object({ from: gstDateSchema, to: gstDateSchema }).strict().superRefine((value, ctx) => {
  if (value.from > value.to) ctx.addIssue({ code: 'custom', path: ['from'], message: 'Start date must not follow end date' });
  const days = (Date.parse(`${value.to}T00:00:00Z`) - Date.parse(`${value.from}T00:00:00Z`)) / 86_400_000;
  if (days > 366) ctx.addIssue({ code: 'custom', path: ['to'], message: 'Choose at most one financial year per close pack' });
});
export const closePackManifestSchema = z.object({
  version: z.literal('ledgercraft-close-pack-v1'),
  organisationName: z.string(),
  period: z.object({ from: gstDateSchema, to: gstDateSchema }).strict(),
  basis: z.literal('accrual'), baseCurrency: z.literal('NZD'), generatedAt: z.string().datetime(),
  periodLock: z.object({ closedThrough: gstDateSchema.nullable(), revision: z.number().int().nonnegative() }).strict(),
  warnings: z.array(z.string()),
  members: z.array(z.object({ name: z.string().regex(/^[a-z0-9][a-z0-9-]*\.(?:csv|json|txt)$/), mediaType: z.enum(['text/csv', 'application/json', 'text/plain']), bytes: z.number().int().nonnegative(), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict()),
}).strict();
export type ClosePackQuery = z.infer<typeof closePackQuerySchema>;
export type ClosePackManifest = z.infer<typeof closePackManifestSchema>;
