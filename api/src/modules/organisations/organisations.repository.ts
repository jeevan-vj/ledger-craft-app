import { and, asc, eq, isNull } from 'drizzle-orm';
import type { Database } from '../../db/client';
import {
  activeOrganisationSelections,
  organisationInvitations,
  organisationMemberships,
  organisations,
  users,
} from '../../db/schema/identity';

export async function membershipsForUser(db: Database, userId: string) {
  return db.select({ membership: organisationMemberships, organisation: organisations })
    .from(organisationMemberships)
    .innerJoin(organisations, eq(organisations.id, organisationMemberships.organisationId))
    .where(and(eq(organisationMemberships.userId, userId), isNull(organisationMemberships.removedAt)))
    .orderBy(asc(organisations.name));
}

export async function activeSelection(db: Database, userId: string) {
  const [row] = await db.select().from(activeOrganisationSelections).where(eq(activeOrganisationSelections.userId, userId));
  return row;
}

export async function setActive(db: Database, userId: string, organisationId: string) {
  await db.insert(activeOrganisationSelections).values({ userId, organisationId, updatedAt: new Date() })
    .onConflictDoUpdate({ target: activeOrganisationSelections.userId, set: { organisationId, updatedAt: new Date() } });
}

export async function createOrganisation(db: Database, userId: string, name: string) {
  const organisation = { id: crypto.randomUUID(), name, createdAt: new Date(), updatedAt: new Date(), archivedAt: null };
  const membership = { id: crypto.randomUUID(), organisationId: organisation.id, userId, role: 'owner', createdAt: new Date(), removedAt: null };
  await db.insert(organisations).values(organisation);
  await db.insert(organisationMemberships).values(membership);
  return { organisation, membership };
}

export async function updateOrganisation(db: Database, organisationId: string, name: string) {
  const [row] = await db.update(organisations).set({ name, updatedAt: new Date() })
    .where(eq(organisations.id, organisationId)).returning();
  return row;
}

export async function archiveOrganisation(db: Database, organisationId: string) {
  const [row] = await db.update(organisations).set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(organisations.id, organisationId)).returning();
  return row;
}

export async function membershipForUser(db: Database, organisationId: string, userId: string) {
  const [row] = await db.select().from(organisationMemberships).where(and(
    eq(organisationMemberships.organisationId, organisationId),
    eq(organisationMemberships.userId, userId),
    isNull(organisationMemberships.removedAt),
  ));
  return row;
}

export async function listMembers(db: Database, organisationId: string) {
  return db.select({ membership: organisationMemberships, user: users })
    .from(organisationMemberships).innerJoin(users, eq(users.id, organisationMemberships.userId))
    .where(and(eq(organisationMemberships.organisationId, organisationId), isNull(organisationMemberships.removedAt)))
    .orderBy(asc(users.name));
}

export async function updateMemberRole(db: Database, organisationId: string, membershipId: string, role: string) {
  const [row] = await db.update(organisationMemberships).set({ role }).where(and(
    eq(organisationMemberships.organisationId, organisationId), eq(organisationMemberships.id, membershipId), isNull(organisationMemberships.removedAt),
  )).returning();
  return row;
}

export async function removeMember(db: Database, organisationId: string, membershipId: string) {
  const [row] = await db.update(organisationMemberships).set({ removedAt: new Date() }).where(and(
    eq(organisationMemberships.organisationId, organisationId), eq(organisationMemberships.id, membershipId), isNull(organisationMemberships.removedAt),
  )).returning();
  return row;
}

export async function listInvitations(db: Database, organisationId: string) {
  return db.select().from(organisationInvitations).where(eq(organisationInvitations.organisationId, organisationId))
    .orderBy(asc(organisationInvitations.email));
}

export async function createInvitation(db: Database, input: typeof organisationInvitations.$inferInsert) {
  const [row] = await db.insert(organisationInvitations).values(input).returning();
  return row;
}

export async function invitationById(db: Database, organisationId: string, invitationId: string) {
  const [row] = await db.select().from(organisationInvitations).where(and(
    eq(organisationInvitations.organisationId, organisationId), eq(organisationInvitations.id, invitationId),
  ));
  return row;
}

export async function invitationByHash(db: Database, tokenHash: string) {
  const [row] = await db.select().from(organisationInvitations).where(eq(organisationInvitations.tokenHash, tokenHash));
  return row;
}

export async function updateInvitation(db: Database, invitationId: string, values: Partial<typeof organisationInvitations.$inferInsert>) {
  const [row] = await db.update(organisationInvitations).set({ ...values, updatedAt: new Date() })
    .where(eq(organisationInvitations.id, invitationId)).returning();
  return row;
}

export async function addMembership(db: Database, organisationId: string, userId: string, role: string) {
  const existing = await membershipForUser(db, organisationId, userId);
  if (existing) return existing;
  const [row] = await db.insert(organisationMemberships).values({
    id: crypto.randomUUID(), organisationId, userId, role, createdAt: new Date(), removedAt: null,
  }).onConflictDoUpdate({
    target: [organisationMemberships.organisationId, organisationMemberships.userId],
    set: { role, removedAt: null },
  }).returning();
  return row;
}
