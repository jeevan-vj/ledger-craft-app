import type { BusinessProfileDto, CustomerDto } from '@ledgercraft/contracts';
import { gstDateSchema, normalizeNzGstNumber, isNzBusinessCountry } from '@ledgercraft/contracts';
import { apiError } from '../../http-error';
import { decimal } from './money';

/** Rendering/issuance validation only: stored document totals are not changed. */
export function assertGstBuyerInformation(
  profile: (Pick<BusinessProfileDto, 'gstRegistrationStatus' | 'country'> & { gstRegisteredFrom?: string | null }) | undefined,
  customer: Pick<CustomerDto, 'name' | 'email' | 'address' | 'phone'>,
  currency: string,
  total: string,
  date?: string,
  snapshot?: { baseCurrency: string; baseTotal: string },
) {
  if (profile?.gstRegistrationStatus !== 'registered' || !isNzBusinessCountry(profile.country)) return;
  if (date && profile.gstRegisteredFrom && gstDateSchema.safeParse(date).success && date < profile.gstRegisteredFrom) return;
  const nzdTotal = currency === 'NZD' ? total : snapshot?.baseCurrency === 'NZD' && (decimal(snapshot.baseTotal).compare(0) > 0 || decimal(total).compare(0) === 0) ? snapshot.baseTotal : null;
  if (nzdTotal !== null && decimal(nzdTotal).compare('1000.00') <= 0) return;
  const identified = [customer.email, customer.address, customer.phone].some(value => Boolean(value?.trim()));
  if (!customer.name.trim() || !identified) {
    throw apiError(422, 'GST_BUYER_DETAILS_REQUIRED', 'For a GST tax invoice over NZ$1,000, add the buyer name and at least one identifier (email, phone or address) in Customers before saving or sending.');
  }
}

export function assertGstSellerReady(profile: (Pick<BusinessProfileDto, 'gstRegistrationStatus' | 'taxId' | 'country' | 'gstAccountingBasis' | 'gstFilingFrequency' | 'gstPeriodAnchor'> & { gstRegisteredFrom?: string | null }) | undefined, date: string, taxAmount: string) {
  if (profile?.gstRegistrationStatus !== 'registered' || !isNzBusinessCountry(profile.country)) return;
  if (!profile.taxId || !normalizeNzGstNumber(profile.taxId) || !gstDateSchema.safeParse(profile.gstRegisteredFrom).success) {
    throw apiError(422, 'GST_REGISTRATION_REVIEW_REQUIRED', 'Complete GST settings with a valid seller GST number and registration date before issuing this tax invoice. You can keep preparing it as a draft.');
  }
  if (!gstDateSchema.safeParse(date).success || (profile.gstRegisteredFrom && date < profile.gstRegisteredFrom && decimal(taxAmount).compare(0) !== 0)) {
    throw apiError(422, 'GST_REGISTRATION_REVIEW_REQUIRED', 'This invoice predates GST registration or has an invalid issue date. Review its date and stored tax before issuing; original amounts have not been changed.');
  }
  if (profile.gstRegisteredFrom && date < profile.gstRegisteredFrom) return;
  if (!profile.gstAccountingBasis || !profile.gstFilingFrequency || profile.gstPeriodAnchor == null) {
    throw apiError(422, 'GST_FILING_SETTINGS_REQUIRED', 'Save the IRD accounting basis, filing frequency and period-ending month in GST settings before sending this tax invoice. Drafts can still be edited.');
  }
}
