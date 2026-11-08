import { closePackManifestSchema, financialReportCsv, generateGstPeriods, reportCsvCell, type ClosePackQuery, type ReportSection } from '@ledgercraft/contracts';
import { strToU8, zipSync } from 'fflate';
import type { Database } from '../../db/client';
import { apiError } from '../../http-error';
import { withOrganisationTx } from '../auth/bind-organisation';
import { hasPermission } from '../auth/permissions';
import { periodLockStateInTx } from '../accounting/period-lock';
import { reconciliationSummaryInTx } from '../reconciliation/reconciliation-summary';
import { gstPreparationInTx } from '../tax/gst-preparation';
import { gstSettingsInTx } from '../tax/gst-settings';
import { closePackContext } from './close-pack.repository';
import { financialReportInTx, generalLedgerInTx } from './reports.service';

const csv = (rows: Array<Array<string | null>>) => rows.map(row => row.map(value => reportCsvCell(value ?? '')).join(',')).join('\n');
const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
const intersects = (from: string, to: string, start: string, end: string) => start <= to && end >= from;
function covers(from: string, to: string, statements: Array<{ statementStartDate: string; statementEndDate: string }>) {
 let next = from;
 for (const statement of [...statements].sort((a,b) => a.statementStartDate.localeCompare(b.statementStartDate))) {
  if (statement.statementEndDate < next) continue;
  if (statement.statementStartDate > next) return false;
  const stamp = new Date(`${statement.statementEndDate}T00:00:00Z`); stamp.setUTCDate(stamp.getUTCDate() + 1); next = stamp.toISOString().slice(0,10);
  if (next > to) return true;
 }
 return false;
}

/** A single company transaction captures every member before ZIP serialization.
 * No posting, filing, recalculation of saved returns, or external operation occurs. */
export async function closePackForUser(db: Database, userId: string, period: ClosePackQuery) {
 const snapshot = await withOrganisationTx(db, userId, async (tx, ctx) => {
  if (!hasPermission(ctx.role, 'reports.read') || !hasPermission(ctx.role, 'banking.read')) throw apiError(403, 'FORBIDDEN', 'Reports and banking read access are required for an accountant close pack.');
  const query = { ...period, basis: 'accrual' as const, baseCurrency: 'NZD' as const };
  const [report, ledger, context, settings, periodLock] = await Promise.all([
   financialReportInTx(tx,ctx.organisationId,query), generalLedgerInTx(tx,ctx.organisationId,query),
   closePackContext(tx,ctx.organisationId), gstSettingsInTx(tx,ctx.organisationId), periodLockStateInTx(tx,ctx.organisationId),
  ]);
  const warnings: string[] = [...(report.meta.warnings ?? [])];
  if (!periodLock.closedThrough || periodLock.closedThrough < period.to) warnings.push('Accounting period is not closed through the report end date; this is a working close pack.');
  if (!report.trialBalance.balanced || !report.balanceSheet.balanced) warnings.push('Posted books do not balance. Review the trial balance and balance sheet before relying on this pack.');
  if (report.receivablesAging.unallocatedControl !== '0.00' || report.payablesAging.unallocatedControl !== '0.00') warnings.push('Aging contains unallocated control balances. Link opening or manual balances to party details.');
  const relevant = context.bankStatements.filter(statement => intersects(period.from,period.to,statement.statementStartDate,statement.statementEndDate));
  const completed = relevant.filter(statement => ['completed','locked'].includes(statement.status));
  const completedStatements = await Promise.all(completed.map(statement => reconciliationSummaryInTx(tx,ctx.organisationId,statement)));
  for (const summary of completedStatements) { warnings.push(...(summary.warnings ?? [])); if (!summary.isReconciled) warnings.push(`Completed bank statement for ${summary.bankAccountName} no longer reconciles; inspect its recorded difference.`); }
  for (const bank of context.bankAccounts.filter(bank => bank.isActive || relevant.some(statement => statement.bankAccountId === bank.id))) {
   if (!covers(period.from,period.to,completed.filter(statement => statement.bankAccountId === bank.id))) warnings.push(`No completed bank statement covers the full reporting period for ${bank.accountName}.`);
  }
  if (!context.bankAccounts.length) warnings.push('No bank accounts exist; no completed bank statement evidence is included.');
  if (completed.some(statement => statement.statementStartDate < period.from || statement.statementEndDate > period.to)) warnings.push('Some completed bank statements extend beyond the reporting period; each retains its own statement cutoff.');
  const retainedRecords = context.retainedReturns.filter(record => record.returnType === 'GST' && intersects(period.from,period.to,record.periodStart,record.periodEnd));
  if (retainedRecords.some(record => !record.returnData?.gstCalculation)) warnings.push('Some retained GST records have no verified calculation snapshot; preserve them and review the original source evidence.');
  let preparation = null;
  if (settings.configured && settings.gstRegistrationStatus === 'registered') {
   preparation = await gstPreparationInTx(tx,ctx,period);
   warnings.push(...preparation.warnings);
   for (const record of retainedRecords.filter(record => record.periodStart === period.from && record.periodEnd === period.to)) {
    const retained = record.returnData?.gstCalculation;
    if (retained && retained.fingerprint !== preparation.calculation?.fingerprint) warnings.push(`Retained GST record ${record.id} fingerprint differs from current preparation; original sources, settings and reviewed adjustments are preserved for review.`);
   }
   if (preparation.requiresReview || preparation.calculation?.mappingStatus === 'requires_confirmation') warnings.push('Current GST preparation requires source or classification review; inspect gst.json before filing separately.');
   if (!generateGstPeriods(settings,period.to).some(value => value.periodStart === period.from && value.periodEnd === period.to)) warnings.push('Reporting dates do not identify one registered GST taxable period; the GST preparation is a working paper, not a filing period.');
   if (!retainedRecords.some(record => record.periodStart === period.from && record.periodEnd === period.to && ['submitted','approved'].includes(record.status))) warnings.push('No retained filed GST confirmation exists for this exact period. Draft/preparation figures are not an IRD filing.');
  } else warnings.push(...settings.warnings, settings.gstRegistrationStatus === 'not_registered' ? 'GST is not registered; no GST preparation is included.' : 'GST settings are not confirmed; no GST preparation is included.');
  return { period, report, ledger, settings, preparation, retainedRecords, periodLock, completedStatements, openStatements:relevant.filter(statement => !['completed','locked'].includes(statement.status)), warnings:[...new Set(warnings)], organisationName:context.organisationName, generatedAt:new Date().toISOString() };
 });
 const files: Record<string,Uint8Array> = {};
 const sections: ReportSection[] = ['trial-balance','balance-sheet','profit-loss','cash-flow','receivables','payables'];
 for (const section of sections) files[`${section}.csv`] = strToU8(financialReportCsv(snapshot.report,section));
 files['reports.json'] = strToU8(json({ financial:snapshot.report, generalLedger:snapshot.ledger }));
 files['general-ledger.csv'] = strToU8(csv([
  ['Date','Entry','Account code','Account','Description','Source type','Source ID','Debit','Credit','Running balance'],
  ...snapshot.ledger.lines.map(line => [line.date,line.entryNumber,line.accountNumber,line.accountName,line.description,line.referenceType,line.referenceId,line.debit,line.credit,line.runningBalance]),
 ]));
 files['bank-reconciliations.json'] = strToU8(json({ completedStatements:snapshot.completedStatements, openStatements:snapshot.openStatements }));
 files['bank-reconciliations.csv'] = strToU8(csv([
  ['Bank account','Bank','Statement start','Statement end','Status','Statement closing','Adjusted statement closing','Book closing','Adjusted book closing','Difference','Matched'],
  ...snapshot.completedStatements.map(value => [value.bankAccountName,value.bankName,value.session.statementStartDate,value.session.statementEndDate,value.session.status,value.bankBalance,value.adjustedBankBalance,value.bookBalance,value.adjustedBookBalance,value.finalDifference,String(value.session.matchedCount)]),
 ]));
 files['gst.json'] = strToU8(json({ settings:snapshot.settings, preparation:snapshot.preparation, retainedRecords:snapshot.retainedRecords }));
 files['accounting-period.json'] = strToU8(json(snapshot.periodLock));
 files['readme.txt'] = strToU8(`Accountant close pack\n${snapshot.organisationName}\n${period.from} to ${period.to}\nAccrual / NZD\nGenerated ${snapshot.generatedAt}\n\nCanonical server reports and exact decimal amounts; CSVs are spreadsheet-safe.\nReports include posted journals only. Original GST records retain their saved settings, source audits and filing references.\nThis archive neither closes the books nor submits GST to IRD. Use manifest.json warnings and the retained records when reviewing readiness.\nMember checksums exclude manifest.json itself.\n`);
 const members = await Promise.all(Object.entries(files).map(async ([name,bytes]) => ({name,mediaType:name.endsWith('.csv')?'text/csv':name.endsWith('.json')?'application/json':'text/plain',bytes:bytes.byteLength,sha256:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(value => value.toString(16).padStart(2,'0')).join('')})));
 const manifest = closePackManifestSchema.parse({version:'ledgercraft-close-pack-v1',organisationName:snapshot.organisationName,period,basis:'accrual',baseCurrency:'NZD',generatedAt:snapshot.generatedAt,periodLock:snapshot.periodLock,warnings:snapshot.warnings,members});
 files['manifest.json'] = strToU8(json(manifest));
 return { filename:`Close-pack-${period.from}-${period.to}.zip`, bytes:zipSync(files,{level:6}), manifest };
}
