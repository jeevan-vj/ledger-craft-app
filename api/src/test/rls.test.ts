import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { users, organisations, organisationMemberships } from '../db/schema/identity';
import { customers } from '../db/schema/customers';
import { createCustomerForUser, getCustomerForUser, listCustomersForUser, updateCustomerForUser } from '../modules/customers/customers.service';
import { createDb } from '../db/local';
import { getDatabaseUrl } from '../env';
import { withOrganisationTx } from '../modules/auth/bind-organisation';
import { ORG_A, ORG_B, USER_A, withTestDb } from './harness';

const USER_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

describe('SQLite application organisation isolation and transactions', () => {
  it('resolves scope from membership and rejects cross-organisation reads and writes', async () => {
    await withTestDb(async ({ db }) => {
      await db.insert(users).values([{ id: USER_A, name: 'A', email: 'a@example.com' }, { id: USER_B, name: 'B', email: 'b@example.com' }]);
      await db.insert(organisations).values([{ id: ORG_A, name: 'Org A' }, { id: ORG_B, name: 'Org B' }]);
      await db.insert(organisationMemberships).values([{ organisationId: ORG_A, userId: USER_A }, { organisationId: ORG_B, userId: USER_B }]);
      const a = await createCustomerForUser(db, USER_A, { name: 'A Ltd', email: 'a@customer.example', country: 'NZ' });
      const b = await createCustomerForUser(db, USER_B, { name: 'B Ltd', email: 'b@customer.example', country: 'NZ' });
      expect((await listCustomersForUser(db, USER_A)).customers.map((row) => row.id)).toEqual([a.id]);
      await expect(getCustomerForUser(db, USER_A, b.id)).rejects.toMatchObject({ status: 404 });
      await expect(updateCustomerForUser(db, USER_A, b.id, { name: 'Forged' })).rejects.toMatchObject({ status: 404 });
      expect((await getCustomerForUser(db, USER_B, b.id)).name).toBe('B Ltd');
      await expect(withOrganisationTx(db, crypto.randomUUID(), async () => true)).rejects.toMatchObject({ status: 403 });
    });
  });

  it('rolls back an async transaction after a later failure', async () => {
    await withTestDb(async ({ db }) => {
      await db.insert(users).values({ id: USER_A, name: 'A', email: 'a@example.com' });
      await db.insert(organisations).values({ id: ORG_A, name: 'Org A' });
      await expect(db.transaction(async (tx) => {
        await tx.insert(customers).values({ organisationId: ORG_A, userId: USER_A, name: 'Must roll back', email: 'rollback@example.com' });
        await Promise.resolve();
        throw new Error('injected failure');
      })).rejects.toThrow('injected failure');
      expect(await db.select().from(customers)).toHaveLength(0);
    });
  });

  it('uses savepoints so an inner rollback preserves the outer transaction', async () => {
    await withTestDb(async ({ db }) => {
      await db.transaction(async (tx) => {
        await tx.insert(users).values({ id: USER_A, name: 'Outer', email: 'outer@example.com' });
        await expect(tx.transaction(async (nested) => {
          await nested.insert(users).values({ id: USER_B, name: 'Inner', email: 'inner@example.com' });
          throw new Error('inner failure');
        })).rejects.toThrow('inner failure');
      });
      expect((await db.select().from(users)).map((user) => user.id)).toEqual([USER_A]);
    });
  });

  it('serializes concurrent read-modify-write transactions without lost updates', async () => {
    await withTestDb(async ({ db }) => {
      await db.insert(users).values({ id: USER_A, name: 'A', email: 'a@example.com' });
      await db.insert(organisations).values({ id: ORG_A, name: 'Org A' });
      const [row] = await db.insert(customers).values({ organisationId: ORG_A, userId: USER_A, name: '0', email: 'counter@example.com' }).returning();
      const second = createDb(getDatabaseUrl());
      try {
      await Promise.all(Array.from({ length: 8 }, (_, index) => (index % 2 ? db : second.db).transaction(async (tx) => {
        const [current] = await tx.select().from(customers).where(eq(customers.id, row.id));
        await Promise.resolve();
        await tx.update(customers).set({ name: String(Number(current.name) + 1) }).where(eq(customers.id, row.id));
      })));
      expect((await db.select().from(customers))[0].name).toBe('8');
      } finally { await second.sql.end(); }
    });
  });
});
