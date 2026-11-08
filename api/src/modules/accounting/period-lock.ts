import type { AccountingPeriodState, CloseAccountingPeriodRequest, ReopenAccountingPeriodRequest } from '@ledgercraft/contracts';
import { accountingPeriodStateSchema } from '@ledgercraft/contracts';
import type { Database } from '../../db/client';
import { apiError } from '../../http-error';
import { withOrganisationTx, type OrganisationContext } from '../auth/bind-organisation';
import { getLocalization } from '../currency/currency.repository';
import { localDateIn } from './organisation-date';
import * as repo from './period-lock.repository';

export async function periodLockStateInTx(tx: Database, organisationId: string) {
  const value = await repo.state(tx, organisationId);
  return { closedThrough: value.closedThrough, revision: value.revision };
}

export async function assertAccountingDateOpen(tx: Database, organisationId: string, ...dates: string[]) {
  const { closedThrough } = await repo.state(tx, organisationId);
  if (closedThrough && dates.some(date => date <= closedThrough)) {
    throw apiError(409, 'ACCOUNTING_PERIOD_CLOSED', `Accounting is closed through ${closedThrough}. Ask an owner or admin to reopen the period with a reason before changing these books.`);
  }
}

/** Global financial policies have no effective date and can rewrite earlier reports. */
export async function assertAccountingSettingsOpen(tx: Database, organisationId: string) {
  const value = await repo.state(tx, organisationId);
  if (value.closedThrough) throw apiError(409, 'ACCOUNTING_PERIOD_CLOSED', `Accounting is closed through ${value.closedThrough}. Reopen the affected accounting periods before changing financial settings.`);
}

async function result(tx: Database, ctx: OrganisationContext): Promise<AccountingPeriodState> {
  const value = await repo.state(tx, ctx.organisationId);
  const events = await repo.events(tx, ctx.organisationId);
  return accountingPeriodStateSchema.parse({
    closedThrough: value.closedThrough, revision: value.revision,
    canClose: ['owner', 'admin', 'accountant'].includes(ctx.role),
    canReopen: ['owner', 'admin'].includes(ctx.role),
    events: events.map(event => ({
      id: event.id, action: event.action, previousClosedThrough: event.previousClosedThrough,
      newClosedThrough: event.newClosedThrough, reason: event.reason, actorId: event.actorId,
      createdAt: event.createdAt.toISOString(), revision: event.revision,
    })),
  });
}

function assertCompany(ctx: OrganisationContext, expectedOrganisationId?: string) {
  if (expectedOrganisationId !== undefined && expectedOrganisationId !== ctx.organisationId) {
    throw apiError(409, 'ORGANISATION_CHANGED', 'The active company changed. Refresh and review this company before closing or reopening accounting.');
  }
}

/** The expected revision plus immutable audit event is the natural operation
 * identity: an exact lost-response retry recovers once, never appends twice. */
async function isReplay(tx: Database, ctx: OrganisationContext, currentRevision: number, expectedRevision: number, action: 'close' | 'reopen', cutoff: string | null, reason: string) {
  if (currentRevision !== expectedRevision + 1) return false;
  const [event] = await repo.events(tx, ctx.organisationId);
  return event?.revision === currentRevision && event.action === action && event.actorId === ctx.userId
    && event.newClosedThrough === cutoff && event.reason === reason;
}

export async function accountingPeriodsForUser(db: Database, userId: string) {
  return withOrganisationTx(db, userId, (tx, ctx) => result(tx, ctx));
}

export async function closeAccountingPeriodForUser(db: Database, userId: string, input: CloseAccountingPeriodRequest, expectedOrganisationId?: string) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    assertCompany(ctx, expectedOrganisationId);
    if (!['owner', 'admin', 'accountant'].includes(ctx.role)) throw apiError(403, 'FORBIDDEN', 'Only an owner, admin or accountant can close accounting periods.');
    const current = await repo.state(tx, ctx.organisationId);
    if (current.revision !== input.expectedRevision) {
      if (await isReplay(tx, ctx, current.revision, input.expectedRevision, 'close', input.through, input.reason)) return result(tx, ctx);
      throw apiError(409, 'STALE_ACCOUNTING_PERIOD', 'Accounting period changed. Refresh and review the latest cutoff.');
    }
    if (current.closedThrough && input.through <= current.closedThrough) throw apiError(409, 'INVALID_ACCOUNTING_CUTOFF', 'Choose a closing date after the current cutoff.');
    const localization = await getLocalization(tx, ctx.organisationId);
    if (input.through > localDateIn(new Date(), localization.timezone)) throw apiError(409, 'INVALID_ACCOUNTING_CUTOFF', 'A future accounting period cannot be closed.');
    await repo.change(tx, { organisationId: ctx.organisationId, actorId: ctx.userId, action: 'close', previousClosedThrough: current.closedThrough, newClosedThrough: input.through, reason: input.reason, expectedRevision: input.expectedRevision });
    return result(tx, ctx);
  });
}

export async function reopenAccountingPeriodForUser(db: Database, userId: string, input: ReopenAccountingPeriodRequest, expectedOrganisationId?: string) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    assertCompany(ctx, expectedOrganisationId);
    if (!['owner', 'admin'].includes(ctx.role)) throw apiError(403, 'FORBIDDEN', 'Only an owner or admin can reopen accounting periods.');
    const previousDay = new Date(`${input.from}T00:00:00Z`);
    previousDay.setUTCDate(previousDay.getUTCDate() - 1);
    const newClosedThrough = input.from === '0001-01-01' ? null : previousDay.toISOString().slice(0, 10);
    const current = await repo.state(tx, ctx.organisationId);
    if (current.revision !== input.expectedRevision) {
      if (await isReplay(tx, ctx, current.revision, input.expectedRevision, 'reopen', newClosedThrough, input.reason)) return result(tx, ctx);
      throw apiError(409, 'STALE_ACCOUNTING_PERIOD', 'Accounting period changed. Refresh and review the latest cutoff.');
    }
    if (!current.closedThrough || input.from > current.closedThrough) throw apiError(409, 'INVALID_ACCOUNTING_CUTOFF', 'Choose a date in the closed accounting period.');
    await repo.change(tx, { organisationId: ctx.organisationId, actorId: ctx.userId, action: 'reopen', previousClosedThrough: current.closedThrough, newClosedThrough, reason: input.reason, expectedRevision: input.expectedRevision });
    return result(tx, ctx);
  });
}
