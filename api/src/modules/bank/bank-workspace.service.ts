import { bankMovementSchema, bankMovementQuerySchema } from '@ledgercraft/contracts';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import { withOrganisationTx } from '../auth/bind-organisation';
import * as bank from './bank.repository';
import * as repo from './bank-workspace.repository';
import { currencyRepository } from '../currency/currency.service';
import { decimal, roundMoney } from '../invoices/money';
export function getDefaultBankForUser(db: Database, userId: string) {
  return withOrganisationTx(db, userId, async (tx, ctx) => ({ bankAccountId: await repo.defaultBankAccount(tx, ctx.organisationId) }));
}
export function setDefaultBankForUser(db: Database, userId: string, bankAccountId: string | null) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    if (bankAccountId) {
      const account = await bank.getAccount(tx, ctx.organisationId, bankAccountId);
      if (!account) throw new HTTPException(404, { message: 'Bank account not found' });
      const settings = await currencyRepository.getLocalization(tx, ctx.organisationId);
      if (!account.isActive || account.currency !== settings.baseCurrency) throw new HTTPException(422, { message: 'Choose an active bank account in the company base currency' });
    }
    await repo.setDefaultBankAccount(tx, ctx.organisationId, bankAccountId);
    return { bankAccountId };
  });
}
export function bankMovementsForUser(db: Database, userId: string, id: string, input: { from: string; to: string }) {
  const query = bankMovementQuerySchema.parse(input);
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const account = await bank.getAccount(tx, ctx.organisationId, id);
    if (!account) throw new HTTPException(404, { message: 'Bank account not found' });
    let opening = decimal(account.openingBalance), inflows = decimal('0'), outflows = decimal('0');
    for (const row of await repo.movements(tx, ctx.organisationId, id)) {
      if (row.date > query.to) continue;
      if (row.date < query.from) opening = row.type === 'credit' ? opening.add(row.amount) : opening.sub(row.amount);
      else if (row.type === 'credit') inflows = inflows.add(row.amount);
      else outflows = outflows.add(row.amount);
    }
    const movement = inflows.sub(outflows);
    return bankMovementSchema.parse({ bankAccountId: id, currency: account.currency, ...query, openingBalance: roundMoney(opening), inflows: roundMoney(inflows), outflows: roundMoney(outflows), movement: roundMoney(movement), closingBalance: roundMoney(opening.add(movement)) });
  });
}
