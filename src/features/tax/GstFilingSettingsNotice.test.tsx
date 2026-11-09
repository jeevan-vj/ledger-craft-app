import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GstFilingSettingsNotice } from './GstFilingSettingsNotice';
import { isGstFilingSettingsError, needsGstFilingSettings } from './gstFilingSettings';

const registered = { country: 'NZ', gstRegistrationStatus: 'registered' as const, gstAccountingBasis: null, gstFilingFrequency: null, gstPeriodAnchor: null };

describe('GST filing settings prompt', () => {
  it('prompts a registered NZ business that has not saved basis and frequency', () => {
    expect(needsGstFilingSettings(registered)).toBe(true);
    expect(needsGstFilingSettings({ ...registered, gstAccountingBasis: 'payments', gstFilingFrequency: 'two_monthly', gstPeriodAnchor: 3 })).toBe(false);
    expect(needsGstFilingSettings({ ...registered, gstRegistrationStatus: 'not_registered' })).toBe(false);
    expect(needsGstFilingSettings({ ...registered, country: 'AU' })).toBe(false);
    expect(isGstFilingSettingsError({ code: 'GST_FILING_SETTINGS_REQUIRED', message: 'Save GST settings.' })).toBe(true);
    expect(isGstFilingSettingsError(new Error('Could not update the share link.'))).toBe(false);
    render(<MemoryRouter><GstFilingSettingsNotice /></MemoryRouter>);
    expect(screen.getByRole('status')).toHaveTextContent(/accounting basis, filing frequency and period-ending month/i);
    expect(screen.getByRole('link', { name: 'Open GST settings' })).toHaveAttribute('href', '/tax-config');
  });
});
