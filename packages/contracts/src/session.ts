import { z } from 'zod';

export const sessionUserSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(1),
});

export const sessionOrganisationSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
});

export const sessionMembershipSchema = z.object({
  role: z.enum(['owner', 'admin', 'accountant', 'member', 'read_only']),
});

export const meResponseSchema = z.object({
  user: sessionUserSchema,
  organisation: sessionOrganisationSchema,
  membership: sessionMembershipSchema,
  permissions: z.array(z.string()).default([]),
});

export const deleteAccountRequestSchema = z.object({
  password: z.string().min(1, 'Enter your current password'),
  confirmation: z.literal('DELETE'),
}).strict();

export const deleteAccountResponseSchema = z.object({
  deleted: z.literal(true),
  deletedAt: z.string().datetime(),
});

export type SessionUser = z.infer<typeof sessionUserSchema>;
export type SessionOrganisation = z.infer<typeof sessionOrganisationSchema>;
export type SessionMembership = z.infer<typeof sessionMembershipSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
export type DeleteAccountRequest = z.infer<typeof deleteAccountRequestSchema>;
export type DeleteAccountResponse = z.infer<typeof deleteAccountResponseSchema>;
