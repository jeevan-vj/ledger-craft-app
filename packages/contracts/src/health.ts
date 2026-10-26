import { z } from 'zod';

export const healthzResponseSchema = z.object({
  status: z.literal('ok'),
  capabilities: z.object({
    email: z.enum(['available', 'unavailable']),
    ai: z.enum(['available', 'unavailable']),
  }),
});

export const readyzOkResponseSchema = z.object({
  status: z.literal('ok'),
});

export const readyzNotReadyResponseSchema = z.object({
  status: z.literal('not_ready'),
});

export const readyzResponseSchema = z.discriminatedUnion('status', [
  readyzOkResponseSchema,
  readyzNotReadyResponseSchema,
]);

export type HealthzResponse = z.infer<typeof healthzResponseSchema>;
export type ReadyzResponse = z.infer<typeof readyzResponseSchema>;
