import type { Database } from '../../db/client';
import { decimal, moneyToCents, roundMoney } from '../invoices/money';
import type { StripeConfig, StripeGateway, StripeRemotePayment } from './stripe.gateway';
import * as audit from './stripe.operations.repository';
import * as repo from './stripe.verification.repository';

export async function nextStripeVerificationTime(db: Database, now = new Date()): Promise<number | undefined> {
  const [accounts, states] = await Promise.all([repo.accounts(db), repo.states(db)]);
  if (!accounts.length) return undefined;
  return Math.min(...accounts.map(account => states.find(state => state.organisationId === account.organisationId)?.nextVerificationAt.getTime() ?? now.getTime()));
}
function compare(remote: StripeRemotePayment, local: Awaited<ReturnType<typeof audit.paymentLink>>, organisationId: string, accountId: string) {
  const differences: string[] = [];
  if (remote.organisationId !== organisationId || remote.destinationAccountId !== accountId) differences.push('provider_routing');
  if (!local) return [...differences, 'missing_local_payment'];
  if (remote.paymentLinkId !== local.link.id) differences.push('payment_link');
  if (!Number.isSafeInteger(remote.amountCents) || BigInt(remote.amountCents) !== moneyToCents(local.payment.amount)) differences.push('amount');
  if (remote.currency !== 'nzd') differences.push('currency');
  if (!Number.isSafeInteger(remote.platformFeeCents) || BigInt(remote.platformFeeCents) !== moneyToCents(local.link.platformFee)) differences.push('platform_fee');
  const status = remote.amountCents > 0 && remote.refundedCents === remote.amountCents ? 'refunded' : remote.status === 'succeeded' ? 'completed' : 'pending';
  if (status !== local.payment.status) differences.push('status');
  if (remote.refundedCents > 0 && remote.refundedCents < remote.amountCents) differences.push('partial_refund');
  return differences;
}
/** Read-only provider discovery and audit: never creates a payment, refund or
 * journal. Alarms retry at most hourly on provider failure, daily on success. */
export async function runStripeVerification(db: Database, gateway: StripeGateway | undefined, config: StripeConfig | undefined, now = new Date()) {
  const result = { checkedOrganisations: 0, checkedPayments: 0, mismatches: 0, unavailable: 0 };
  if (!gateway || !config || !gateway.listRecentPayments || !gateway.retrievePayment || !gateway.retrieveBalance) return result;
  const since = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  for (const account of await repo.accounts(db)) {
    if (!await repo.claim(db, account.organisationId, now)) continue;
    result.checkedOrganisations++;
    try {
      const discovered = await gateway.listRecentPayments(account.organisationId, account.stripeAccountId, since);
      const checks = new Map(discovered.items.filter(item => item.status === 'succeeded' || item.refundedCents > 0).map(item => [item.id, item]));
      for (const link of await repo.recentLinks(db, account.organisationId, since)) {
        if (link.stripePaymentIntentId && !checks.has(link.stripePaymentIntentId)) checks.set(link.stripePaymentIntentId, await gateway.retrievePayment(link.stripePaymentIntentId));
      }
      for (const remote of checks.values()) {
        const link = await audit.linkByIntent(db, remote.id);
        const local = link?.organisationId === account.organisationId && link.paymentId ? await audit.paymentLink(db, account.organisationId, link.paymentId) : undefined;
        const differences = compare(remote, local, account.organisationId, account.stripeAccountId);
        await audit.record(db, { organisationId: account.organisationId, paymentId: local?.payment.id, stripeObjectId: remote.id, kind: 'daily_payment', result: differences.length ? 'mismatch' : 'match', differences });
        result.checkedPayments++; if (differences.length) result.mismatches++;
      }
      const remoteBalance = await gateway.retrieveBalance(account.stripeAccountId);
      if (![remoteBalance.availableCents, remoteBalance.pendingCents].every(Number.isSafeInteger)) throw new Error('Invalid provider balance');
      const clearing = await audit.clearingBalance(db, account.organisationId);
      const provider = roundMoney(decimal(String(remoteBalance.availableCents)).add(String(remoteBalance.pendingCents)).div('100'));
      const difference = roundMoney(decimal(provider).sub(clearing));
      const differences = [...(difference !== '0.00' ? ['clearing_balance'] : []), ...(!discovered.complete ? ['incomplete_provider_window'] : [])];
      await audit.record(db, { organisationId: account.organisationId, stripeObjectId: account.stripeAccountId, kind: 'daily_discovery', result: differences.length ? 'mismatch' : 'match', differences, details: { from: since.toISOString(), to: now.toISOString(), postedClearing: clearing, providerBalance: provider, difference, complete: String(discovered.complete) } });
      if (differences.length) result.mismatches++;
      await repo.finish(db, account.organisationId, now, false);
    } catch {
      result.unavailable++;
      await audit.record(db, { organisationId: account.organisationId, stripeObjectId: account.stripeAccountId, kind: 'daily_discovery', result: 'unavailable', differences: ['provider_unavailable'], details: { warning: 'The provider check could not complete. No financial record changed; the next attempt is in one hour.' } });
      await repo.finish(db, account.organisationId, now, true);
    }
  }
  return result;
}
