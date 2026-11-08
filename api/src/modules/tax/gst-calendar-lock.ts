import { assertAccountingSettingsOpen } from '../accounting/period-lock';
import type { BusinessProfileDto, UpsertBusinessProfileRequest } from '@ledgercraft/contracts';
import type { Database } from '../../db/client';
import { apiError } from '../../http-error';
import * as taxRepo from './tax.repository';

/** Existing filings are not a licence to invent an IRD calendar transition. */
export async function assertGstCalendarChangeAllowed(tx: Database, organisationId: string, current: BusinessProfileDto, input: Partial<UpsertBusinessProfileRequest>) {
  const financialFields = ['taxId','gstRegisteredFrom','gstRegistrationStatus','gstAccountingBasis','gstFilingFrequency','gstPeriodAnchor','defaultTaxRate','country'] as const;
  if(financialFields.some(field=>input[field]!==undefined && input[field]!==current[field])) await assertAccountingSettingsOpen(tx, organisationId);
  const fields = ['gstRegisteredFrom', 'gstFilingFrequency', 'gstPeriodAnchor'] as const;
  // A legacy NULL is unknown, not a historic calendar we can assert or invent.
  // Explicit owner completion may fill it while leaving filed records intact.
  if (!fields.some(field => current[field] != null && input[field] !== undefined && input[field] !== current[field])) return;
  const filed = (await taxRepo.listReturns(tx, organisationId)).some(row => row.returnType === 'GST' && ['submitted', 'approved'].includes(row.status));
  if (filed) throw apiError(409, 'GST_SETTINGS_TRANSITION_REQUIRED', 'Filed GST returns retain their original calendar. A filing-frequency, anchor or registration-date change requires an audited IRD-approved transition; keep the original calendar until that transition is supported.');
}
