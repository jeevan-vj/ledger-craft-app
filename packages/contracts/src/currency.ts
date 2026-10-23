import { z } from 'zod';

const canonicalDecimal = z.string().regex(/^\d+(\.\d+)?$/);
const positiveDecimal = canonicalDecimal.refine((value) => !/^0+(?:\.0+)?$/.test(value), 'Rate must be greater than zero');
const currencyCode = z.string().regex(/^[A-Z]{3}$/);
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const currencyPrecisionSchema = z.number().int().min(0).max(4);
export const currencySymbolPositionSchema = z.enum(['before', 'after']);
export const dateFormatSchema = z.enum(['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY']);
export const numberFormatSchema = z.enum(['1,234.56', '1.234,56', '1 234,56']);
export const percentPositionSchema = z.enum(['before', 'after']);

export const currencyDefinitionSchema = z.object({
  code: currencyCode,
  name: z.string().trim().min(1).max(80),
  precision: currencyPrecisionSchema,
  symbol: z.string().min(1).max(8),
  symbolPosition: currencySymbolPositionSchema,
  enabled: z.boolean(),
  isBase: z.boolean(),
}).strict();

const localizationSettingsObjectSchema = z.object({
  baseCurrency: currencyCode,
  locale: z.string().regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/),
  language: z.string().regex(/^[a-z]{2,3}$/),
  timezone: z.string().min(1).max(100),
  dateFormat: dateFormatSchema,
  numberFormat: numberFormatSchema,
  financialYearStartMonth: z.number().int().min(1).max(12),
  financialYearStartDay: z.number().int().min(1).max(31),
  percentPosition: percentPositionSchema,
}).strict();

export const localizationSettingsSchema = localizationSettingsObjectSchema.superRefine((value, ctx) => {
  const maxDay = [4, 6, 9, 11].includes(value.financialYearStartMonth) ? 30 : value.financialYearStartMonth === 2 ? 29 : 31;
  if (value.financialYearStartDay > maxDay) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['financialYearStartDay'], message: 'Day is not valid for the selected month' });
});

export const exchangeRateSchema = z.object({
  id: z.string().uuid(), currencyCode, baseCurrency: currencyCode, effectiveDate: dateOnly,
  rate: positiveDecimal, usageCount: z.number().int().nonnegative(), immutable: z.literal(true),
  createdAt: z.string().min(1), createdByUserId: z.string().uuid(),
}).strict();

export const currencySettingsSchema = z.object({
  localization: localizationSettingsSchema,
  currencies: z.array(currencyDefinitionSchema),
  rates: z.array(exchangeRateSchema),
}).strict().superRefine((value, ctx) => {
  const bases = value.currencies.filter((currency) => currency.isBase);
  if (bases.length !== 1 || bases[0]?.code !== value.localization.baseCurrency) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['currencies'], message: 'Exactly one catalogue currency must match the base currency' });
  }
  if (bases[0] && !bases[0].enabled) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['currencies'], message: 'Base currency must be enabled' });
});

export const updateCurrencySettingsRequestSchema = localizationSettingsObjectSchema.partial().strict().superRefine((value, ctx) => {
  if (value.financialYearStartMonth !== undefined && value.financialYearStartDay !== undefined) {
    const maxDay = [4, 6, 9, 11].includes(value.financialYearStartMonth) ? 30 : value.financialYearStartMonth === 2 ? 29 : 31;
    if (value.financialYearStartDay > maxDay) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['financialYearStartDay'], message: 'Day is not valid for the selected month' });
  }
});

export const upsertCurrencyRequestSchema = currencyDefinitionSchema.omit({ isBase: true }).strict();
export const createExchangeRateRequestSchema = z.object({ currencyCode, effectiveDate: dateOnly, rate: positiveDecimal }).strict();
export const documentCurrencySchema = z.object({
  currency: currencyCode, exchangeRate: positiveDecimal, exchangeRateId: z.string().uuid().nullable(), baseCurrency: currencyCode,
  baseSubtotal: canonicalDecimal, baseTaxAmount: canonicalDecimal, baseTotal: canonicalDecimal,
}).strict();

export type CurrencyDefinitionDto = z.infer<typeof currencyDefinitionSchema>;
export type LocalizationSettingsDto = z.infer<typeof localizationSettingsSchema>;
export type ExchangeRateDto = z.infer<typeof exchangeRateSchema>;
export type CurrencySettingsDto = z.infer<typeof currencySettingsSchema>;
export type UpdateCurrencySettingsRequest = z.infer<typeof updateCurrencySettingsRequestSchema>;
export type UpsertCurrencyRequest = z.infer<typeof upsertCurrencyRequestSchema>;
export type CreateExchangeRateRequest = z.infer<typeof createExchangeRateRequestSchema>;
export type DocumentCurrencyDto = z.infer<typeof documentCurrencySchema>;
