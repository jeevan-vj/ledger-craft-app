import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { createDb } from '../../db/local';
import { accountDeletionTombstones, organisationMemberships, organisations, users } from '../../db/schema/identity';
import { getDatabaseUrl } from '../../env';
import { assertLocalDatabaseReachable, withTestDb } from '../../test/harness';
import { AccountDeletionService, type AccountPreDeleteHook } from './account-deletion.service';

async function seed(db: ReturnType<typeof createDb>['db'], members: Array<{ id: string; role: string }>) {
  for (const member of members) {
    await db.insert(users).values({ id: member.id, name: member.id, email: `${member.id}@example.com` });
  }
  await db.insert(organisations).values({ id: '11111111-1111-1111-1111-111111111111', name: 'Test org' });
  for (const member of members) {
    await db.insert(organisationMemberships).values({ organisationId: '11111111-1111-1111-1111-111111111111', userId: member.id, role: member.role });
  }
}

describe('AccountDeletionService', () => {
  it('runs required hooks before purging a sole-owner organisation and leaves only a non-PII tombstone', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        await seed(db, [{ id: 'delete-me', role: 'owner' }]);
        const order: string[] = [];
        const hook: AccountPreDeleteHook = { name: 'akahu', required: true, onBeforeAccountDelete: async () => { order.push('hook'); } };
        const service = new AccountDeletionService({ hooks: [hook], purgeOrganisation: async () => { order.push('purge'); } });
        await service.delete(db, { id: 'delete-me', email: 'delete-me@example.com', name: 'Delete Me' });

        expect(order).toEqual(['hook', 'purge']);
        expect(await db.select().from(users).where(eq(users.id, 'delete-me'))).toEqual([]);
        const tombstones = await db.select().from(accountDeletionTombstones);
        expect(tombstones).toHaveLength(1);
        expect(JSON.stringify(tombstones[0])).not.toContain('delete-me');
        expect(JSON.stringify(tombstones[0])).not.toContain('@example.com');
      } finally { await sql.end(); }
    });
  });

  it('aborts before any purge when a required pre-delete hook fails', async () => {
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        await seed(db, [{ id: 'delete-me', role: 'owner' }]);
        const purge = vi.fn();
        const service = new AccountDeletionService({
          hooks: [{ name: 'akahu', required: true, onBeforeAccountDelete: async () => { throw new Error('revoke failed'); } }],
          purgeOrganisation: purge,
        });
        await expect(service.delete(db, { id: 'delete-me', email: 'delete-me@example.com', name: 'Delete Me' })).rejects.toThrow(/akahu/i);
        expect(purge).not.toHaveBeenCalled();
        expect(await db.select().from(users).where(eq(users.id, 'delete-me'))).toHaveLength(1);
      } finally { await sql.end(); }
    });
  });

  it('continues when a best-effort pre-delete hook fails', async () => {
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        await seed(db, [{ id: 'delete-me', role: 'owner' }]);
        const purge = vi.fn();
        const service = new AccountDeletionService({
          hooks: [{ name: 'optional-provider', required: false, onBeforeAccountDelete: async () => { throw new Error('offline'); } }],
          purgeOrganisation: purge,
        });
        await expect(service.delete(db, { id: 'delete-me', email: 'delete-me@example.com', name: 'Delete Me' })).resolves.toMatchObject({ deleted: true });
        expect(purge).toHaveBeenCalledTimes(1);
      } finally { await sql.end(); }
    });
  });

  it('blocks a sole owner who still has other members, with no partial deletion', async () => {
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        await seed(db, [{ id: 'delete-me', role: 'owner' }, { id: 'member', role: 'member' }]);
        const purge = vi.fn();
        const service = new AccountDeletionService({ purgeOrganisation: purge });
        await expect(service.delete(db, { id: 'delete-me', email: 'delete-me@example.com', name: 'Delete Me' })).rejects.toThrow(/transfer ownership or remove/i);
        expect(purge).not.toHaveBeenCalled();
        expect(await db.select().from(users).where(eq(users.id, 'delete-me'))).toHaveLength(1);
      } finally { await sql.end(); }
    });
  });

  it('removes only the deleting co-owner and leaves the organisation data untouched', async () => {
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        await seed(db, [{ id: 'delete-me', role: 'owner' }, { id: 'other-owner', role: 'owner' }]);
        const purge = vi.fn();
        const removeMembership = vi.fn();
        const service = new AccountDeletionService({ purgeOrganisation: purge, removeOrganisationMembership: removeMembership });
        await service.delete(db, { id: 'delete-me', email: 'delete-me@example.com', name: 'Delete Me' });
        expect(purge).not.toHaveBeenCalled();
        expect(removeMembership).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111', 'delete-me');
        expect(await db.select().from(organisations)).toHaveLength(1);
        expect(await db.select().from(users).where(eq(users.id, 'other-owner'))).toHaveLength(1);
      } finally { await sql.end(); }
    });
  });

  it('retries safely after one organisation purge succeeded and a later purge failed', async () => {
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        await db.insert(users).values({ id: 'delete-me', name: 'Delete Me', email: 'delete-me@example.com' });
        for (const id of ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222']) {
          await db.insert(organisations).values({ id, name: id });
          await db.insert(organisationMemberships).values({ organisationId: id, userId: 'delete-me', role: 'owner' });
        }
        let fail = true;
        const purged = new Set<string>();
        const service = new AccountDeletionService({ purgeOrganisation: async (id) => {
          if (id.startsWith('2222') && fail) { fail = false; throw new Error('temporary purge failure'); }
          purged.add(id);
        } });
        await expect(service.delete(db, { id: 'delete-me', email: 'delete-me@example.com', name: 'Delete Me' })).rejects.toThrow('temporary');
        expect(await db.select().from(users).where(eq(users.id, 'delete-me'))).toHaveLength(1);
        await service.delete(db, { id: 'delete-me', email: 'delete-me@example.com', name: 'Delete Me' });
        expect(purged.size).toBe(2);
        expect(await db.select().from(users).where(eq(users.id, 'delete-me'))).toEqual([]);
      } finally { await sql.end(); }
    });
  });
});
