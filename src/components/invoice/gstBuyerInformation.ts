import { moneyToCents } from '../../../api/src/modules/invoices/money';
import type { BusinessProfile, Customer } from '@/types';
import { gstDateSchema, isNzBusinessCountry } from '@ledgercraft/contracts';

export function gstBuyerInformationIssue(profile: (BusinessProfile & { gstRegisteredFrom?: string | null }) | null, customer: Customer | undefined, currency: string, total: string | number, date?: string, snapshot?: { baseCurrency?: string; baseTotal?: string }): string | null {
  if (!/^-?\d+(?:\.\d+)?$/.test(String(total))) return null;
  if (profile?.gstRegistrationStatus !== 'registered' || !isNzBusinessCountry(profile.country)) return null;
  if (date && profile.gstRegisteredFrom && gstDateSchema.safeParse(date).success && date < profile.gstRegisteredFrom) return null;
  const knownTotal = currency === 'NZD' ? String(total) : snapshot?.baseCurrency === 'NZD' ? snapshot.baseTotal : undefined;
  // New foreign-currency documents await the server's reviewed rate snapshot.
  if (knownTotal === undefined || moneyToCents(knownTotal) <= 100000n) return null;
  if (customer?.name.trim() && [customer.email, customer.phone, customer.address].some(value => value?.trim())) return null;
  return 'For a GST tax invoice over NZ$1,000, add the buyer name and at least one identifier (email, phone or address) in Customers before saving or sending.';
}
