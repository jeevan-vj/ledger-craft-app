import { isNzBusinessCountry } from '@ledgercraft/contracts';
import type { BusinessProfile } from '@/types';

export const GST_FILING_SETTINGS_REQUIRED = 'GST_FILING_SETTINGS_REQUIRED';

export function isGstFilingSettingsError(error: unknown): error is { code: typeof GST_FILING_SETTINGS_REQUIRED; message: string } {
  return typeof error === 'object' && error !== null
    && 'code' in error && (error as { code?: unknown }).code === GST_FILING_SETTINGS_REQUIRED
    && 'message' in error && typeof (error as { message?: unknown }).message === 'string';
}

export function needsGstFilingSettings(profile: Pick<BusinessProfile, 'country' | 'gstRegistrationStatus' | 'gstAccountingBasis' | 'gstFilingFrequency' | 'gstPeriodAnchor'> | null | undefined): boolean {
  if (!profile || profile.gstRegistrationStatus !== 'registered' || !isNzBusinessCountry(profile.country)) return false;
  return !profile.gstAccountingBasis || !profile.gstFilingFrequency || profile.gstPeriodAnchor == null;
}
