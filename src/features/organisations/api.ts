import {
  invitationCreatedResponseSchema, invitationListResponseSchema, organisationListResponseSchema,
  organisationMemberListResponseSchema, organisationMutationResponseSchema,
  type OrganisationRole,
} from '@ledgercraft/contracts';
import { readApiFailure } from '@/lib/api/readApiError';

async function request(path: string, init?: RequestInit) {
  const response = await fetch(path, { credentials: 'include', ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  if (!response.ok) { const failure = await readApiFailure(response); throw new Error(failure.message); }
  if (response.status === 204) return undefined;
  return response.json();
}

export const organisationsApi = {
  list: async () => organisationListResponseSchema.parse(await request('/api/organisations')),
  create: async (name: string) => organisationMutationResponseSchema.parse(await request('/api/organisations', { method: 'POST', body: JSON.stringify({ name }) })),
  update: async (id: string, name: string) => organisationMutationResponseSchema.parse(await request(`/api/organisations/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) })),
  switch: async (id: string) => organisationMutationResponseSchema.parse(await request(`/api/organisations/${id}/switch`, { method: 'POST' })),
  archive: async (id: string) => request(`/api/organisations/${id}/archive`, { method: 'POST' }),
  members: async (id: string) => organisationMemberListResponseSchema.parse(await request(`/api/organisations/${id}/members`)),
  invitations: async (id: string) => invitationListResponseSchema.parse(await request(`/api/organisations/${id}/invitations`)),
  invite: async (id: string, email: string, role: Exclude<OrganisationRole, 'owner'>) => invitationCreatedResponseSchema.parse(await request(`/api/organisations/${id}/invitations`, { method: 'POST', body: JSON.stringify({ email, role }) })),
  resendInvitation: async (id: string, invitationId: string) => invitationCreatedResponseSchema.parse(await request(`/api/organisations/${id}/invitations/${invitationId}/resend`, { method: 'POST' })),
  revokeInvitation: async (id: string, invitationId: string) => request(`/api/organisations/${id}/invitations/${invitationId}`, { method: 'DELETE' }),
  updateMember: async (id: string, memberId: string, role: Exclude<OrganisationRole, 'owner'>) => request(`/api/organisations/${id}/members/${memberId}`, { method: 'PATCH', body: JSON.stringify({ role }) }),
  removeMember: async (id: string, memberId: string) => request(`/api/organisations/${id}/members/${memberId}`, { method: 'DELETE' }),
  acceptInvitation: async (token: string) => request('/api/invitations/accept', { method: 'POST', body: JSON.stringify({ token }) }),
};
