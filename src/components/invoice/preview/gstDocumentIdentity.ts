import type { BusinessProfile } from '@/types';
import { showPositiveAmount } from '@/utils/invoiceLineDisplay';
import { resolveDocumentLabels, type DocumentLabels } from './documentLabels';
import { gstDateSchema, normalizeNzGstNumber, formatNzGstNumber, isNzBusinessCountry } from '@ledgercraft/contracts';

export function gstDocumentLabels(profile: BusinessProfile | null | undefined, taxAmount: number, labels?: DocumentLabels, date?: string, taxInclusive?: boolean): DocumentLabels {
  const copy = resolveDocumentLabels(labels);
  const registered = profile?.gstRegistrationStatus === 'registered' && isNzBusinessCountry(profile.country);
  const unregistered = profile?.gstRegistrationStatus === 'not_registered';
  const digits = registered && profile.taxId ? normalizeNzGstNumber(profile.taxId) : null;
  const validRegistration = registered && Boolean(digits) && gstDateSchema.safeParse((profile as (BusinessProfile & { gstRegisteredFrom?: string | null }) | null)?.gstRegisteredFrom).success;
  const registeredFrom = (profile as (BusinessProfile & { gstRegisteredFrom?: string | null }) | null)?.gstRegisteredFrom;
  const predatesRegistration = validRegistration && date && registeredFrom && date < registeredFrom;
  const validForDocument = validRegistration && !predatesRegistration;
  const sellerTaxId = validForDocument && digits ? formatNzGstNumber(digits) : null;
  return {
    ...copy,
    title: copy.showPayment && validForDocument ? 'TAX INVOICE' : copy.title,
    sellerTaxId,
    showTax: !unregistered && !predatesRegistration,
    taxLabel: validForDocument ? 'GST' : 'Tax',
    ...(validForDocument ? { taxPriceNote: `${typeof taxInclusive === 'boolean' ? `Line prices ${taxInclusive ? 'include' : 'exclude'} GST. ` : ''}Subtotal excludes GST; total includes GST.` } : {}),
    ...(unregistered && showPositiveAmount(taxAmount) ? { taxReviewWarning: 'This saved document includes tax while the seller is not GST registered. Review its original amounts before issuing it.' } : {}),
    ...(registered && !validRegistration ? { taxReviewWarning: 'Complete GST settings with a valid seller GST number and registration date before issuing this tax invoice. You can keep preparing it as a draft.' } : {}),
    ...(predatesRegistration && showPositiveAmount(taxAmount) ? { taxReviewWarning: 'This saved document predates GST registration. Review its original date and tax amounts before issuing it.' } : {}),
  };
}
