import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WelcomeStep from '../WelcomeStep';
import { DEFAULT_BUSINESS_THEME } from '@/types';
import { DEFAULT_INVOICE_NUMBER_FORMAT, DEFAULT_ONBOARDING_COUNTRY, getDefaultTaxRate } from '@/utils/countryTaxDefaults';

const baseData = {
  businessName: '',
  businessEmail: 'owner@studio.test',
  country: DEFAULT_ONBOARDING_COUNTRY,
  invoiceNumberFormat: DEFAULT_INVOICE_NUMBER_FORMAT,
  defaultTaxRate: getDefaultTaxRate(DEFAULT_ONBOARDING_COUNTRY),
  theme: DEFAULT_BUSINESS_THEME,
};

describe('WelcomeStep', () => {
  it('shows name, country, prefilled email, and no extra setup fields', () => {
    render(
      <WelcomeStep
        data={baseData}
        onDataChange={vi.fn()}
        onNext={vi.fn()}
        onSkip={vi.fn()}
      />
    );

    expect(screen.getByTestId('onboarding-business-name')).toBeInTheDocument();
    expect(screen.getByTestId('onboarding-country')).toBeInTheDocument();
    expect(screen.getByTestId('onboarding-email-hint')).toHaveTextContent('owner@studio.test');
    expect(screen.queryByPlaceholderText(/business email/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/invoice number format/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/upload logo/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('onboarding-submit')).toBeDisabled();
  });

  it('submits a valid name and updates tax when country changes', async () => {
    const user = userEvent.setup();
    const onDataChange = vi.fn();
    const onNext = vi.fn();

    render(
      <WelcomeStep
        data={{ ...baseData, businessName: 'North Shore Studio' }}
        onDataChange={onDataChange}
        onNext={onNext}
        onSkip={vi.fn()}
      />
    );

    await user.selectOptions(screen.getByTestId('onboarding-country'), 'Australia');
    expect(onDataChange).toHaveBeenCalledWith({
      country: 'Australia',
      defaultTaxRate: 10,
    });

    await user.click(screen.getByTestId('onboarding-submit'));
    expect(onNext).toHaveBeenCalled();
  });
});
