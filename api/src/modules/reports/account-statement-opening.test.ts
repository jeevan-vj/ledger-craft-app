import { describe, expect, it } from 'vitest';
import { accounts } from '../../db/schema/accounts';
import { organisationMemberships, organisations, users } from '../../db/schema/identity';
import { ORG_A, USER_A, withTestDb } from '../../test/harness';
import { postOpeningBalancesForUser } from '../accounting/recovery.service';
import { accountStatementForUser } from './reports.service';

describe('account statements use posted opening journals', () => {
  it('reports5000 once when metadata5000 has a matching reviewed opening journal', async () => withTestDb(async ({ db }) => {
    await db.insert(users).values({ id: USER_A, name: 'Opening accountant', email: 'statement-opening@example.test' });
    await db.insert(organisations).values({ id: ORG_A, name: 'Opening statement company' });
    await db.insert(organisationMemberships).values({ organisationId: ORG_A, userId: USER_A, role: 'owner' });
    const [cash, capital] = await db.insert(accounts).values([
      { organisationId: ORG_A, userId: USER_A, name: 'Opening bank', type: 'bank', accountNumber: '1110', accountClass: 'asset', openingBalance: '5000' },
      { organisationId: ORG_A, userId: USER_A, name: 'Capital', type: 'equity', accountNumber: '3000', accountClass: 'equity' },
    ]).returning();
    const query = { from: '2026-04-01', to: '2026-04-30', basis: 'accrual' as const, baseCurrency: 'NZD' as const };
    const metadataOnly = await accountStatementForUser(db, USER_A, cash!.id, query);
    await postOpeningBalancesForUser(db, USER_A, { date: '2026-04-01', reference: 'Opening trial balance reviewed', reviewed: true, lines: [{ accountId: cash!.id, debit: '5000', credit: '0' }, { accountId: capital!.id, debit: '0', credit: '5000' }] });
    const april = await accountStatementForUser(db, USER_A, cash!.id, query);
    expect(april.closingBalance).toBe('5000.00');
    expect(april.openingBalance).toBe('0.00');
    expect(april.movements).toHaveLength(1);
    expect(april.movements[0]!.debit).toBe('5000.00');
    const may = await accountStatementForUser(db, USER_A, cash!.id, { ...query, from: '2026-05-01', to: '2026-05-31' });
    expect(may.openingBalance).toBe('5000.00');
    expect(may.closingBalance).toBe('5000.00');
    expect(metadataOnly.openingBalance).toBe('0.00');
    expect(metadataOnly.closingBalance).toBe('0.00');
  }));
});
