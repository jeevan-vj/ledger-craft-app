import { z } from 'zod';

export const organisationRoleSchema = z.enum(['owner', 'admin', 'accountant', 'member', 'read_only']);
export const organisationPermissionSchema = z.enum([
  'organisations.create', 'organisations.update', 'organisations.archive', 'organisations.switch',
  'customers.read', 'customers.write', 'invoices.read', 'invoices.write', 'bills.read', 'bills.write',
  'banking.read', 'banking.write', 'reports.read', 'settings.read', 'settings.write',
  'users.read', 'users.manage', 'api.access', 'invoices.import', 'ai.use',
]);

export const createOrganisationRequestSchema = z.object({ name: z.string().trim().min(2).max(120) });
export const updateOrganisationRequestSchema = createOrganisationRequestSchema;
export const updateMemberRequestSchema = z.object({ role: organisationRoleSchema.exclude(['owner']) });
export const createInvitationRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: organisationRoleSchema.exclude(['owner']),
});
export const acceptInvitationRequestSchema = z.object({ token: z.string().min(32).max(256) });

export const organisationSummarySchema = z.object({
  id: z.string().uuid(), name: z.string().min(1), role: organisationRoleSchema,
  isActive: z.boolean(), archivedAt: z.string().datetime().nullable(),
});
export const organisationListResponseSchema = z.object({ organisations: z.array(organisationSummarySchema) });
export const organisationMutationResponseSchema = z.object({ organisation: organisationSummarySchema });
export const organisationMemberSchema = z.object({
  id: z.string().uuid(), userId: z.string().uuid(), name: z.string().min(1), email: z.string().email(),
  role: organisationRoleSchema, joinedAt: z.string().datetime(),
});
export const organisationMemberListResponseSchema = z.object({ members: z.array(organisationMemberSchema) });
export const invitationSchema = z.object({
  id: z.string().uuid(), organisationId: z.string().uuid(), email: z.string().email(),
  role: organisationRoleSchema.exclude(['owner']), status: z.enum(['pending', 'accepted', 'revoked', 'expired']),
  expiresAt: z.string().datetime(), createdAt: z.string().datetime(),
});
export const invitationListResponseSchema = z.object({ invitations: z.array(invitationSchema) });
export const invitationCreatedResponseSchema = invitationSchema.extend({
  acceptToken: z.string().min(32), deliveryStatus: z.literal('link_ready'),
});

export type OrganisationRole = z.infer<typeof organisationRoleSchema>;
export type OrganisationPermission = z.infer<typeof organisationPermissionSchema>;
export type CreateOrganisationRequest = z.infer<typeof createOrganisationRequestSchema>;
export type UpdateOrganisationRequest = z.infer<typeof updateOrganisationRequestSchema>;
export type UpdateMemberRequest = z.infer<typeof updateMemberRequestSchema>;
export type CreateInvitationRequest = z.infer<typeof createInvitationRequestSchema>;
export type AcceptInvitationRequest = z.infer<typeof acceptInvitationRequestSchema>;
export type OrganisationSummary = z.infer<typeof organisationSummarySchema>;
export type OrganisationMember = z.infer<typeof organisationMemberSchema>;
export type OrganisationInvitation = z.infer<typeof invitationSchema>;
