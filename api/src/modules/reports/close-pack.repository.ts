import type { Database } from '../../db/client';
import * as banks from '../bank/bank.repository';
import * as statements from '../reconciliation/reconciliation.repository';
import * as tax from '../tax/tax.repository';
import { reportBusinessName } from './reports.repository';

/** Metadata queries only; all money remains on the canonical report services. */
export async function closePackContext(tx: Database, organisationId: string) {
 const [organisationName, bankAccounts, bankStatements, retainedReturns] = await Promise.all([
  reportBusinessName(tx, organisationId), banks.listAccounts(tx, organisationId),
  statements.listSessions(tx, organisationId), tax.listReturns(tx, organisationId),
 ]);
 return { organisationName, bankAccounts, bankStatements, retainedReturns };
}
