import {
  invitationCreatedResponseSchema, invitationListResponseSchema, organisationListResponseSchema,
  organisationMemberListResponseSchema, organisationMutationResponseSchema,
  type CreateInvitationRequest, type CreateOrganisationRequest, type OrganisationPermission,
  type UpdateMemberRequest, type UpdateOrganisationRequest,
} from '@ledgercraft/contracts';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import { hasPermission } from '../auth/permissions';
import * as repo from './organisations.repository';

const day = 24 * 60 * 60 * 1000;
const iso = (value: Date | null) => value?.toISOString() ?? null;

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function token(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function requireMembership(db: Database, userId: string, organisationId: string, permission: OrganisationPermission) {
  const membership = await repo.membershipForUser(db, organisationId, userId);
  if (!membership || !hasPermission(membership.role, permission)) throw new HTTPException(403, { message: 'Forbidden' });
  return membership;
}

function summary(row: Awaited<ReturnType<typeof repo.membershipsForUser>>[number], activeId?: string) {
  return {
    id: row.organisation.id, name: row.organisation.name, role: row.membership.role,
    isActive: row.organisation.id === activeId, archivedAt: iso(row.organisation.archivedAt),
  };
}

export async function list(db: Database, userId: string) {
  const [rows, selection] = await Promise.all([repo.membershipsForUser(db, userId), repo.activeSelection(db, userId)]);
  return organisationListResponseSchema.parse({ organisations: rows.map((row) => summary(row, selection?.organisationId ?? rows[0]?.organisation.id)) });
}

export async function create(db: Database, userId: string, input: CreateOrganisationRequest) {
  return db.transaction(async (tx) => {
    const created = await repo.createOrganisation(tx, userId, input.name);
    await repo.setActive(tx, userId, created.organisation.id);
    return organisationMutationResponseSchema.parse({ organisation: {
      id: created.organisation.id, name: created.organisation.name, role: 'owner', isActive: true, archivedAt: null,
    } });
  });
}

export async function update(db: Database, userId: string, organisationId: string, input: UpdateOrganisationRequest) {
  const membership = await requireMembership(db, userId, organisationId, 'organisations.update');
  const organisation = input.name ? await repo.updateOrganisation(db, organisationId, input.name) : null;
  if (!organisation) throw new HTTPException(404, { message: 'Organisation not found' });
  const selection = await repo.activeSelection(db, userId);
  return organisationMutationResponseSchema.parse({ organisation: {
    id: organisation.id, name: organisation.name, role: membership.role,
    isActive: selection?.organisationId === organisation.id, archivedAt: iso(organisation.archivedAt),
  } });
}

export async function switchActive(db: Database, userId: string, organisationId: string) {
  const membership = await requireMembership(db, userId, organisationId, 'organisations.switch');
  const rows = await repo.membershipsForUser(db, userId);
  const row = rows.find((candidate) => candidate.organisation.id === organisationId && !candidate.organisation.archivedAt);
  if (!row) throw new HTTPException(404, { message: 'Organisation not found' });
  await repo.setActive(db, userId, organisationId);
  return organisationMutationResponseSchema.parse({ organisation: { ...summary(row, organisationId), role: membership.role } });
}

export async function archive(db: Database, userId: string, organisationId: string) {
  await requireMembership(db, userId, organisationId, 'organisations.archive');
  const rows = (await repo.membershipsForUser(db, userId)).filter((row) => !row.organisation.archivedAt && row.organisation.id !== organisationId);
  if (!rows.length) throw new HTTPException(409, { message: 'Create or join another active organisation before archiving this one' });
  await db.transaction(async (tx) => {
    await repo.archiveOrganisation(tx, organisationId);
    await repo.setActive(tx, userId, rows[0].organisation.id);
  });
}

export async function members(db: Database, userId: string, organisationId: string) {
  await requireMembership(db, userId, organisationId, 'users.read');
  const rows = await repo.listMembers(db, organisationId);
  return organisationMemberListResponseSchema.parse({ members: rows.map(({ membership, user }) => ({
    id: membership.id, userId: user.id, name: user.name, email: user.email,
    role: membership.role, joinedAt: membership.createdAt.toISOString(),
  })) });
}

export async function updateMember(db: Database, actorId: string, organisationId: string, membershipId: string, input: UpdateMemberRequest) {
  await requireMembership(db, actorId, organisationId, 'users.manage');
  const target = (await repo.listMembers(db, organisationId)).find((row) => row.membership.id === membershipId)?.membership;
  if (!target) throw new HTTPException(404, { message: 'Member not found' });
  if (target.role === 'owner') throw new HTTPException(409, { message: 'Owner role cannot be changed' });
  return repo.updateMemberRole(db, organisationId, membershipId, input.role);
}

export async function removeMember(db: Database, actorId: string, organisationId: string, membershipId: string) {
  await requireMembership(db, actorId, organisationId, 'users.manage');
  const target = (await repo.listMembers(db, organisationId)).find((row) => row.membership.id === membershipId)?.membership;
  if (!target) throw new HTTPException(404, { message: 'Member not found' });
  if (target.role === 'owner') throw new HTTPException(409, { message: 'Owner cannot be removed' });
  await repo.removeMember(db, organisationId, membershipId);
}

function invitationDto(invitation: NonNullable<Awaited<ReturnType<typeof repo.invitationById>>>) {
  const status = invitation.status === 'pending' && invitation.expiresAt.getTime() <= Date.now() ? 'expired' : invitation.status;
  return {
    id: invitation.id, organisationId: invitation.organisationId, email: invitation.email,
    role: invitation.role, status, expiresAt: invitation.expiresAt.toISOString(), createdAt: invitation.createdAt.toISOString(),
  };
}

export async function invitations(db: Database, userId: string, organisationId: string) {
  await requireMembership(db, userId, organisationId, 'users.read');
  return invitationListResponseSchema.parse({ invitations: (await repo.listInvitations(db, organisationId)).map(invitationDto) });
}

export async function invite(db: Database, userId: string, organisationId: string, input: CreateInvitationRequest) {
  await requireMembership(db, userId, organisationId, 'users.manage');
  const rawToken = token();
  const invitation = await repo.createInvitation(db, {
    id: crypto.randomUUID(), organisationId, email: input.email, role: input.role,
    tokenHash: await hashToken(rawToken), status: 'pending', invitedByUserId: userId,
    expiresAt: new Date(Date.now() + 7 * day), createdAt: new Date(), updatedAt: new Date(),
  });
  return invitationCreatedResponseSchema.parse({ ...invitationDto(invitation), acceptToken: rawToken, deliveryStatus: 'link_ready' });
}

export async function resend(db: Database, userId: string, organisationId: string, invitationId: string) {
  await requireMembership(db, userId, organisationId, 'users.manage');
  const existing = await repo.invitationById(db, organisationId, invitationId);
  if (!existing || existing.status !== 'pending') throw new HTTPException(409, { message: 'Invitation is no longer pending' });
  const rawToken = token();
  const invitation = await repo.updateInvitation(db, invitationId, { tokenHash: await hashToken(rawToken), expiresAt: new Date(Date.now() + 7 * day) });
  return invitationCreatedResponseSchema.parse({ ...invitationDto(invitation), acceptToken: rawToken, deliveryStatus: 'link_ready' });
}

export async function revoke(db: Database, userId: string, organisationId: string, invitationId: string) {
  await requireMembership(db, userId, organisationId, 'users.manage');
  const existing = await repo.invitationById(db, organisationId, invitationId);
  if (!existing || existing.status !== 'pending') throw new HTTPException(409, { message: 'Invitation is no longer pending' });
  await repo.updateInvitation(db, invitationId, { status: 'revoked' });
}

export async function accept(db: Database, user: { id: string; email: string }, rawToken: string) {
  return db.transaction(async (tx) => {
    const invitation = await repo.invitationByHash(tx, await hashToken(rawToken));
    if (!invitation || invitation.status !== 'pending') throw new HTTPException(409, { message: 'Invitation is invalid or already used' });
    if (invitation.expiresAt.getTime() <= Date.now()) {
      await repo.updateInvitation(tx, invitation.id, { status: 'expired' });
      throw new HTTPException(410, { message: 'Invitation has expired' });
    }
    if (invitation.email.toLowerCase() !== user.email.toLowerCase()) throw new HTTPException(403, { message: 'Invitation belongs to another email address' });
    await repo.addMembership(tx, invitation.organisationId, user.id, invitation.role);
    await repo.updateInvitation(tx, invitation.id, { status: 'accepted', acceptedAt: new Date() });
    await repo.setActive(tx, user.id, invitation.organisationId);
    return { accepted: true, organisationId: invitation.organisationId };
  });
}
