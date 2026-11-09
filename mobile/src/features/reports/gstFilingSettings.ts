import { isNzBusinessCountry } from '@ledgercraft/contracts';

export function needsGstFilingSettings(profile: { country?: string | null; gstRegistrationStatus?: string | null; gstAccountingBasis?: string | null; gstFilingFrequency?: string | null; gstPeriodAnchor?: number | null } | null | undefined): boolean {
  if (!profile || profile.gstRegistrationStatus !== 'registered' || !isNzBusinessCountry(profile.country)) return false;
  return !profile.gstAccountingBasis || !profile.gstFilingFrequency || profile.gstPeriodAnchor == null;
}
