import { describe, expect, it } from 'vitest';
import { gstSettingsSchema, updateGstSettingsRequestSchema, gstPeriodsResponseSchema, normalizeNzGstNumber, generateGstPeriods } from './gst-settings';

const settings = { gstRegistrationStatus: 'registered' as const, taxId: '49-091-850', gstRegisteredFrom: '2026-04-10', gstAccountingBasis: 'payments' as const, gstFilingFrequency: 'two_monthly' as const, gstPeriodAnchor: 5 };
describe('saved NZ GST settings and periods', () => {
  it('normalises valid eight/nine digit IRD numbers and rejects bad check digits', () => {
    expect(normalizeNzGstNumber('49-091-850')).toBe('49091850');
    expect(normalizeNzGstNumber('123 456 785')).toBe('123456785');
    for (const input of ['123456789', '000000000', '4909185', '490918501']) expect(normalizeNzGstNumber(input)).toBe(null);
    expect(updateGstSettingsRequestSchema.parse(settings).taxId).toBe('49091850');
  });
  it('requires explicit registration settings without inventing defaults', () => {
    expect(updateGstSettingsRequestSchema.safeParse({ ...settings, gstRegisteredFrom: null }).success).toBe(false);
    expect(updateGstSettingsRequestSchema.safeParse({ ...settings, gstAccountingBasis: null }).success).toBe(false);
    expect(updateGstSettingsRequestSchema.safeParse({ ...settings, gstRegisteredFrom: '2026-02-30' }).success).toBe(false);
    expect(updateGstSettingsRequestSchema.safeParse({ ...settings, gstPeriodAnchor: 13 }).success).toBe(false);
    expect(gstSettingsSchema.parse({ gstRegistrationStatus: 'unknown', taxId: null, gstRegisteredFrom: null, gstAccountingBasis: null, gstFilingFrequency: null, gstPeriodAnchor: null, configured: false, reviewRequired: true, warnings: ['Confirm your GST settings'] }).gstAccountingBasis).toBe(null);
  });
  it('clips the first two-monthly period to registration and applies IRD exceptions', () => {
    const periods = generateGstPeriods({ ...settings, taxId: '49091850' }, '2027-03-15');
    expect(periods[0]).toMatchObject({ periodStart: '2026-04-10', periodEnd: '2026-05-31', dueDate: '2026-06-29' });
    expect(periods.find(row => row.periodEnd === '2026-11-30')?.dueDate).toBe('2027-01-15');
    expect(periods.find(row => row.periodEnd === '2027-03-31')?.dueDate).toBe('2027-05-07');
  });
  it('supports six-monthly and monthly periods and published holiday shifts', () => {
    const six = generateGstPeriods({ ...settings, gstRegisteredFrom: '2026-04-01', gstFilingFrequency: 'six_monthly', gstPeriodAnchor: 3 }, '2026-10-01');
    expect(six.map(row => [row.periodStart, row.periodEnd, row.dueDate])).toEqual([['2026-04-01', '2026-09-30', '2026-10-28'], ['2026-10-01', '2027-03-31', '2027-05-07']]);
    const matariki = generateGstPeriods({ ...settings, gstRegisteredFrom: '2024-05-01', gstFilingFrequency: 'monthly' }, '2024-05-15');
    expect(matariki[0]?.dueDate).toBe('2024-07-01'); // Published Matariki Friday28June, then weekend.
    expect(gstPeriodsResponseSchema.safeParse({ settings: { ...settings, configured: true, reviewRequired: false, warnings: [] }, asOf: '2024-05-15', periods: [], reviewRequired: false, warnings: [] }).success).toBe(true);
  });
});
