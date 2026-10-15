import { z } from 'zod';

export const customerSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  email: z.string(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  zip: z.string().nullable(),
  country: z.string().min(1),
  phone: z.string().nullable(),
  isVip: z.boolean().nullable(),
  tags: z.array(z.string()).nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const createCustomerRequestSchema = z
  .object({
    name: z.string().min(1),
    email: z.string(),
    address: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    state: z.string().nullable().optional(),
    zip: z.string().nullable().optional(),
    country: z.string().min(1).optional(),
    phone: z.string().nullable().optional(),
    isVip: z.boolean().nullable().optional(),
    tags: z.array(z.string()).nullable().optional(),
  })
  .strict();

export const updateCustomerRequestSchema = createCustomerRequestSchema.partial();

export const customerListResponseSchema = z.object({
  customers: z.array(customerSchema),
});

export type CustomerDto = z.infer<typeof customerSchema>;
export type CreateCustomerRequest = z.infer<typeof createCustomerRequestSchema>;
export type UpdateCustomerRequest = z.infer<typeof updateCustomerRequestSchema>;
export type CustomerListResponse = z.infer<typeof customerListResponseSchema>;
