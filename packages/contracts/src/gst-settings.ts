import { z } from 'zod';
import { nextNzNationalBusinessDay } from './nz-public-holidays';

export const gstDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Choose a valid calendar date');
export const gstAccountingBasisSchema = z.enum(['invoice', 'payments', 'hybrid']);
export const gstFilingFrequencySchema = z.enum(['monthly', 'two_monthly', 'six_monthly']);
export function isNzBusinessCountry(value: string | null | undefined): boolean {
  return ['NZ', 'NZL', 'NEW ZEALAND'].includes(value?.trim().toUpperCase() ?? '');
}
export function normalizeNzGstNumber(input: string): string | null {
  const digits = input.replace(/[\s-]/g, '');
  if (!/^\d{8,9}$/.test(digits) || Number(digits) < 10_000_000 || Number(digits) > 150_000_000) return null;
  const padded = digits.padStart(9, '0');
  const check = (weights: number[]) => {
    const remainder = [...padded.slice(0, 8)].reduce((sum, digit, index) => sum + Number(digit) * weights[index], 0) % 11;
    return remainder === 0 ? 0 : 11 - remainder;
  };
  const first = check([3, 2, 7, 6, 5, 4, 3, 2]);
  const expected = first === 10 ? check([7, 4, 3, 2, 5, 2, 7, 6]) : first;
  return expected !== 10 && expected === Number(padded[8]) ? digits : null;
}
export function formatNzGstNumber(value: string) { return value.replace(/(\d+)(\d{3})(\d{3})$/, '$1-$2-$3'); }
export const nzGstNumberSchema = z.string().transform((value, ctx) => {
  const normalized = normalizeNzGstNumber(value);
  if (!normalized) { ctx.addIssue({ code: 'custom', message: 'Enter a valid 8- or 9-digit NZ IRD/GST number, including its check digit.' }); return z.NEVER; }
  return normalized;
});
const metadata = {
  gstRegistrationStatus: z.enum(['unknown', 'registered', 'not_registered']),
  taxId: z.string().nullable(),
  gstRegisteredFrom: gstDateSchema.nullable(),
  gstAccountingBasis: gstAccountingBasisSchema.nullable(),
  gstFilingFrequency: gstFilingFrequencySchema.nullable(),
  gstPeriodAnchor: z.number().int().min(1).max(12).nullable(),
};
export const gstSettingsSchema = z.object({ ...metadata, configured: z.boolean(), reviewRequired: z.boolean(), warnings: z.array(z.string()) }).strict();
export const updateGstSettingsRequestSchema = z.object({
  ...metadata, taxId: nzGstNumberSchema.nullable(),
}).strict().superRefine((value, ctx) => {
  if (value.gstRegistrationStatus === 'registered') {
    for (const field of ['taxId', 'gstRegisteredFrom', 'gstAccountingBasis', 'gstFilingFrequency', 'gstPeriodAnchor'] as const) {
      if (value[field] === null) ctx.addIssue({ code: 'custom', path: [field], message: 'Confirm this setting from your IRD GST registration.' });
    }
  }
});
export const gstPeriodSchema = z.object({
  periodStart: gstDateSchema, periodEnd: gstDateSchema, dueDate: gstDateSchema,
  status: z.enum(['not_started', 'draft', 'filed', 'overdue', 'reopened']),
  taxReturnId: z.string().uuid().nullable(), netGst: z.string().regex(/^-?\d+\.\d{2}$/).nullable(), irdReference: z.string().nullable(),
  dueDateRequiresConfirmation: z.boolean().optional(),
});
export const gstPeriodsResponseSchema = z.object({ settings: gstSettingsSchema, asOf: gstDateSchema, periods: z.array(gstPeriodSchema), reviewRequired: z.boolean(), warnings: z.array(z.string()) }).strict();
export type GstSettingsDto = z.infer<typeof gstSettingsSchema>;
export type UpdateGstSettingsRequest = z.infer<typeof updateGstSettingsRequestSchema>;
export type GstPeriodDto = z.infer<typeof gstPeriodSchema>;
export type GstPeriodsResponse = z.infer<typeof gstPeriodsResponseSchema>;
export type GeneratedGstPeriod = Pick<GstPeriodDto, 'periodStart' | 'periodEnd' | 'dueDate' | 'dueDateRequiresConfirmation'>;

export function gstPeriodDueDate(periodEnd: string): Pick<GstPeriodDto, 'dueDate' | 'dueDateRequiresConfirmation'> {
  gstDateSchema.parse(periodEnd);
  const date = new Date(`${periodEnd}T00:00:00Z`), year = date.getUTCFullYear(), month = date.getUTCMonth();
  const due = month === 10 ? new Date(Date.UTC(year + 1, 0, 15)) : month === 2 ? new Date(Date.UTC(year, 4, 7)) : new Date(Date.UTC(year, month + 1, 28));
  const dueYear = due.getUTCFullYear();
  return { dueDate: nextNzNationalBusinessDay(due.toISOString().slice(0, 10)), dueDateRequiresConfirmation: dueYear < 2014 || dueYear > 2052 };
}
export function generateGstPeriods(settings: Pick<GstSettingsDto, 'gstRegisteredFrom' | 'gstFilingFrequency' | 'gstPeriodAnchor'> & Partial<GstSettingsDto>, asOf: string): GeneratedGstPeriod[] {
  gstDateSchema.parse(asOf);
  if (!settings.gstRegisteredFrom || !settings.gstFilingFrequency || !settings.gstPeriodAnchor || settings.gstRegisteredFrom > asOf) return [];
  const start = new Date(`${gstDateSchema.parse(settings.gstRegisteredFrom)}T00:00:00Z`);
  const length = { monthly: 1, two_monthly: 2, six_monthly: 6 }[settings.gstFilingFrequency];
  let endMonth = start.getUTCFullYear() * 12 + start.getUTCMonth();
  while (((endMonth % 12 + 1) - settings.gstPeriodAnchor + 12) % length !== 0) endMonth += 1;
  const result: GeneratedGstPeriod[] = [];
  for (let count = 0; count < 1200; count += 1, endMonth += length) {
    const normalStart = new Date(Date.UTC(Math.floor((endMonth - length + 1) / 12), (endMonth - length + 1) % 12, 1)).toISOString().slice(0, 10);
    const periodStart = normalStart < settings.gstRegisteredFrom ? settings.gstRegisteredFrom : normalStart;
    if (periodStart > asOf) return result;
    const periodEnd = new Date(Date.UTC(Math.floor(endMonth / 12), endMonth % 12 + 1, 0)).toISOString().slice(0, 10);
    result.push({ periodStart, periodEnd, ...gstPeriodDueDate(periodEnd) });
  }
  throw new Error('Registration spans more than the supported 1,200 GST periods; review the registration date.');
}
