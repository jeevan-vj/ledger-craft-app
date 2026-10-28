import { z } from 'zod';
import { positiveAmountAtMostTwoDecimals } from './positive-amount';

const exactMoney = z.string().regex(/^\d+(\.\d{1,2})?$/, 'Use an exact amount with at most 2 decimal places');

export const stripeAccountStateSchema = z.enum([
  'not_connected',
  'onboarding',
  'restricted',
  'active',
  'disabled',
]);

export const stripeAccountStatusSchema = z.object({
  status: stripeAccountStateSchema,
  chargesEnabled: z.boolean(),
  payoutsEnabled: z.boolean(),
  detailsSubmitted: z.boolean(),
  requirementsDue: z.array(z.string()),
  disabledReason: z.string().nullable(),
}).strict();

export const stripeOnboardingLinkRequestSchema = z.object({
  platform: z.enum(['web', 'mobile']).default('web'),
}).strict();

export const stripeOnboardingLinkSchema = z.object({
  url: z.string().url().refine((value) => value.startsWith('https://'), 'Onboarding URL must use HTTPS'),
  expiresAt: z.string().datetime(),
}).strict();

export const createStripePaymentLinkRequestSchema = z.object({
  amount: positiveAmountAtMostTwoDecimals.optional(),
}).strict();

export const stripePaymentLinkStatusSchema = z.enum([
  'open',
  'paid',
  'expired',
  'cancelled',
  'failed',
]);

export const stripePaymentLinkSchema = z.object({
  id: z.string().uuid(),
  invoiceId: z.string().uuid(),
  status: stripePaymentLinkStatusSchema,
  amount: exactMoney,
  currency: z.literal('NZD'),
  platformFee: exactMoney,
  payUrl: z.string().url(),
  expiresAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  paymentId: z.string().uuid().nullable(),
  receiptId: z.string().uuid().nullable(),
}).strict();

export const stripePaymentLinkListSchema = z.object({ items: z.array(stripePaymentLinkSchema) }).strict();

export type StripeAccountStatus = z.infer<typeof stripeAccountStatusSchema>;
export type StripeOnboardingLinkRequest = z.infer<typeof stripeOnboardingLinkRequestSchema>;
export type StripeOnboardingLink = z.infer<typeof stripeOnboardingLinkSchema>;
export type CreateStripePaymentLinkRequest = z.infer<typeof createStripePaymentLinkRequestSchema>;
export type StripePaymentLink = z.infer<typeof stripePaymentLinkSchema>;
