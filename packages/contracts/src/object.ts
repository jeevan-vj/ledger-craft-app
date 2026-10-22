import { z } from 'zod';

export const objectKindSchema = z.enum(['receipt', 'logo', 'bank_attachment']);

export const uploadObjectRequestSchema = z
  .object({
    kind: objectKindSchema,
    filename: z.string().min(1).max(255),
    contentType: z.string().min(1),
    contentBase64: z.string().min(1),
  })
  .strict();

export const objectSchema = z.object({
  key: z.string().min(1),
  url: z.string().min(1),
  contentType: z.string().min(1),
  size: z.number().int().nonnegative(),
  kind: objectKindSchema,
});

export type ObjectKind = z.infer<typeof objectKindSchema>;
export type UploadObjectRequest = z.infer<typeof uploadObjectRequestSchema>;
export type ObjectDto = z.infer<typeof objectSchema>;
