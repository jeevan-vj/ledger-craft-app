import { z } from 'zod';

export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    requestId: z.string().min(1),
  }),
});

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

export function createErrorEnvelope(
  code: string,
  message: string,
  requestId: string,
): ErrorEnvelope {
  return errorEnvelopeSchema.parse({
    error: { code, message, requestId },
  });
}
