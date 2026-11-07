import { generateGstPeriods, gstDateSchema, gstPeriodDueDate, gstPeriodsResponseSchema, gstSettingsSchema, isNzBusinessCountry, normalizeNzGstNumber, updateGstSettingsRequestSchema, type GstPeriodDto, type GstSettingsDto, type UpdateGstSettingsRequest } from '@ledgercraft/contracts';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import type { AppEnv } from '../../types';
import { withOrganisationTx } from '../auth/bind-organisation';
import { requireSession } from '../auth/require-session';
import { localDateIn } from '../accounting/organisation-date';
import * as profileRepo from '../business-profile/business-profile.repository';
import * as taxRepo from './tax.repository';
import { assertGstCalendarChangeAllowed } from './gst-calendar-lock';

/** No nested organisation transaction: calculations/save can use this snapshot. */
export async function gstSettingsInTx(tx: Database, organisationId: string): Promise<GstSettingsDto> {
  const profile = await profileRepo.getBusinessProfile(tx, organisationId);
  const settings = {
    gstRegistrationStatus: profile?.gstRegistrationStatus ?? 'unknown', taxId: profile?.taxId ?? null,
    gstRegisteredFrom: profile?.gstRegisteredFrom ?? null, gstAccountingBasis: profile?.gstAccountingBasis ?? null,
    gstFilingFrequency: profile?.gstFilingFrequency ?? null, gstPeriodAnchor: profile?.gstPeriodAnchor ?? null,
  };
  const registeredConfigured = settings.gstRegistrationStatus === 'registered' && isNzBusinessCountry(profile?.country)
    && !!settings.taxId && !!normalizeNzGstNumber(settings.taxId) && !!settings.gstRegisteredFrom
    && !!settings.gstAccountingBasis && !!settings.gstFilingFrequency && settings.gstPeriodAnchor !== null;
  const configured = registeredConfigured || (isNzBusinessCountry(profile?.country) && settings.gstRegistrationStatus === 'not_registered');
  const warnings = profile?.country && !isNzBusinessCountry(profile.country)
    ? ['These IRD GST settings are for a New Zealand business. Review the business country before preparing NZ GST.']
    : !configured ? ['Confirm your IRD GST registration status, valid GST number, effective registration date, accounting basis, filing frequency and period anchor. Legacy values are not guessed.']
      : settings.gstRegistrationStatus === 'not_registered' ? ['This business is not GST registered; GST return periods are not generated.'] : [];
  return gstSettingsSchema.parse({ ...settings, configured, reviewRequired: !configured, warnings });
}
export async function gstSettingsForUser(db: Database, userId: string) {
  return withOrganisationTx(db, userId, (tx, ctx) => gstSettingsInTx(tx, ctx.organisationId));
}
export async function updateGstSettingsForUser(db: Database, userId: string, input: UpdateGstSettingsRequest) {
  const parsed = updateGstSettingsRequestSchema.parse(input);
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const profile = await profileRepo.getBusinessProfile(tx, ctx.organisationId);
    if (!profile) throw new HTTPException(400, { message: 'Set up your business profile before confirming GST settings.' });
    if (!isNzBusinessCountry(profile.country)) throw new HTTPException(422, { message: 'IRD GST settings are available for a New Zealand business only.' });
    await assertGstCalendarChangeAllowed(tx, ctx.organisationId, profile, parsed);
    await profileRepo.upsertBusinessProfile(tx, ctx, { name: profile.name, email: profile.email, ...parsed });
    const result = await gstSettingsInTx(tx, ctx.organisationId);
    return profile.gstAccountingBasis && parsed.gstAccountingBasis && profile.gstAccountingBasis !== parsed.gstAccountingBasis
      ? { ...result, warnings: [...result.warnings, 'Confirm that IRD has approved the new GST accounting basis. Existing filed snapshots retain the basis used when they were prepared.'] } : result;
  });
}
export async function gstPeriodsForUser(db: Database, userId: string, asOf = localDateIn(new Date(), 'Pacific/Auckland')) {
  gstDateSchema.parse(asOf);
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const settings = await gstSettingsInTx(tx, ctx.organisationId);
    const warnings = [...settings.warnings];
    if (!settings.configured || settings.gstRegistrationStatus !== 'registered') {
      return gstPeriodsResponseSchema.parse({ settings, asOf, periods: [], reviewRequired: settings.reviewRequired, warnings });
    }
    let generated;
    try { generated = generateGstPeriods(settings, asOf); }
    catch (error) {
      return gstPeriodsResponseSchema.parse({ settings, asOf, periods: [], reviewRequired: true, warnings: [...warnings, error instanceof Error ? error.message : 'Review the GST registration date.'] });
    }
    const records = (await taxRepo.listReturns(tx, ctx.organisationId)).filter(row => row.returnType === 'GST' && row.periodStart <= asOf);
    const filed = records.filter(row => ['submitted', 'approved'].includes(row.status));
    const seen = new Set<string>();
    let legacyMismatch = false;
    const periods: GstPeriodDto[] = [];
    const add = (period: { periodStart: string; periodEnd: string; dueDate: string; dueDateRequiresConfirmation?: boolean }, row?: typeof records[number]) => {
      const isFiled = row !== undefined && ['submitted', 'approved'].includes(row.status);
      const dueDate = row?.returnData?.preparation?.dueDate ?? period.dueDate;
      periods.push({ ...period, dueDate, status: isFiled ? 'filed' : row ? 'draft' : dueDate < asOf ? 'overdue' : 'not_started', taxReturnId: row?.id ?? null, netGst: row?.netGst ?? null, irdReference: isFiled ? row?.irdReference ?? null : null });
      if (row) seen.add(row.id);
    };
    for (const period of generated) {
      const matches = records.filter(row => row.periodStart === period.periodStart && row.periodEnd === period.periodEnd)
        .sort((a, b) => Number(['submitted', 'approved'].includes(b.status)) - Number(['submitted', 'approved'].includes(a.status)) || b.updatedAt.localeCompare(a.updatedAt));
      if (matches[0]) add(period, matches[0]);
      else if (filed.some(row => row.periodStart <= period.periodEnd && row.periodEnd >= period.periodStart)) legacyMismatch = true;
      else add(period);
    }
    for (const row of records.filter(row => !seen.has(row.id))) {
      if (periods.some(period => period.periodStart === row.periodStart && period.periodEnd === row.periodEnd)) continue;
      legacyMismatch = true;
      add({ periodStart: row.periodStart, periodEnd: row.periodEnd, ...gstPeriodDueDate(row.periodEnd) }, row);
    }
    if (legacyMismatch) warnings.push('Saved GST returns retain their original periods and snapshots. Some differ from current registration settings; review those original dates rather than silently regenerating filed history.');
    if (records.some(row => row.status === 'rejected')) warnings.push('A rejected GST record is shown as a draft for review, not as filed.');
    warnings.push('Due dates use published NZ national holidays. Confirm regional anniversary days, IRD extensions and the final date in myIR before filing.');
    if (periods.some(row => row.dueDateRequiresConfirmation)) warnings.push('A due date falls outside the published 2014–2052 national-calendar coverage; confirm it in myIR.');
    periods.sort((a, b) => a.periodStart.localeCompare(b.periodStart) || a.periodEnd.localeCompare(b.periodEnd));
    return gstPeriodsResponseSchema.parse({ settings, asOf, periods, reviewRequired: legacyMismatch || periods.some(row => row.dueDateRequiresConfirmation), warnings });
  });
}
export function gstSettingsRoutes() {
  const routes = new Hono<AppEnv>();
  for (const prefix of ['', '/api'] as const) {
    routes.get(`${prefix}/tax/gst-settings`, async c => { const { db, user } = await requireSession(c); return c.json(await gstSettingsForUser(db, user.id)); });
    routes.put(`${prefix}/tax/gst-settings`, async c => { const { db, user } = await requireSession(c); return c.json(await updateGstSettingsForUser(db, user.id, updateGstSettingsRequestSchema.parse(await c.req.json()))); });
    routes.get(`${prefix}/tax/gst-periods`, async c => { const { db, user } = await requireSession(c); const asOf = c.req.query('asOf'); return c.json(await gstPeriodsForUser(db, user.id, asOf === undefined ? undefined : gstDateSchema.parse(asOf))); });
  }
  return routes;
}
