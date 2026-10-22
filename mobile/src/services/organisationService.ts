import { apiRequest } from '@/features/auth/api/http';

export type OrganisationRole = 'owner' | 'admin' | 'accountant' | 'member' | 'read_only';
export type OrganisationSummary = { id: string; name: string; role: OrganisationRole; isActive: boolean; archivedAt: string | null };
export type OrganisationMember = { id: string; userId: string; name: string; email: string; role: OrganisationRole; joinedAt: string };
export type OrganisationInvitation = { id: string; organisationId: string; email: string; role: Exclude<OrganisationRole, 'owner'>; status: 'pending' | 'accepted' | 'revoked' | 'expired'; expiresAt: string; createdAt: string };

export const organisationService = {
  list: () => apiRequest<{ organisations: OrganisationSummary[] }>('/api/organisations'),
  create: (name: string) => apiRequest<{ organisation: OrganisationSummary }>('/api/organisations', { method: 'POST', body: JSON.stringify({ name }) }),
  update: (id: string, name: string) => apiRequest<{ organisation: OrganisationSummary }>(`/api/organisations/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  switch: (id: string) => apiRequest<{ organisation: OrganisationSummary }>(`/api/organisations/${id}/switch`, { method: 'POST' }),
  archive: (id: string) => apiRequest<void>(`/api/organisations/${id}/archive`, { method: 'POST' }),
  members: (id: string) => apiRequest<{ members: OrganisationMember[] }>(`/api/organisations/${id}/members`),
  updateMember: (id: string, memberId: string, role: Exclude<OrganisationRole, 'owner'>) => apiRequest<void>(`/api/organisations/${id}/members/${memberId}`, { method: 'PATCH', body: JSON.stringify({ role }) }),
  removeMember: (id: string, memberId: string) => apiRequest<void>(`/api/organisations/${id}/members/${memberId}`, { method: 'DELETE' }),
  invitations: (id: string) => apiRequest<{ invitations: OrganisationInvitation[] }>(`/api/organisations/${id}/invitations`),
  invite: (id: string, email: string, role: Exclude<OrganisationRole, 'owner'>) => apiRequest<OrganisationInvitation & { acceptToken: string; deliveryStatus: 'link_ready' }>(`/api/organisations/${id}/invitations`, { method: 'POST', body: JSON.stringify({ email, role }) }),
  resendInvitation: (id: string, invitationId: string) => apiRequest<OrganisationInvitation & { acceptToken: string; deliveryStatus: 'link_ready' }>(`/api/organisations/${id}/invitations/${invitationId}/resend`, { method: 'POST' }),
  revokeInvitation: (id: string, invitationId: string) => apiRequest<void>(`/api/organisations/${id}/invitations/${invitationId}`, { method: 'DELETE' }),
  accept: (token: string) => apiRequest<{ accepted: boolean; organisationId: string }>('/api/invitations/accept', { method: 'POST', body: JSON.stringify({ token }) }),
};
