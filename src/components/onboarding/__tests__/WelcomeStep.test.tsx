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

  it('keeps the country change separate and submits only after a GST choice', async () => {
    const user = userEvent.setup();
    const onDataChange = vi.fn();
    const onNext = vi.fn();

    const { rerender } = render(
      <WelcomeStep
        data={{ ...baseData, businessName: 'North Shore Studio' }}
        onDataChange={onDataChange}
        onNext={onNext}
      />
    );

    await user.selectOptions(screen.getByTestId('onboarding-country'), 'Australia');
    expect(onDataChange).toHaveBeenCalledWith({ country: 'Australia' });
    expect(screen.getByTestId('onboarding-submit')).toBeDisabled();

    await user.click(screen.getByTestId('onboarding-gst-registered'));
    expect(onDataChange).toHaveBeenCalledWith({ gstRegistrationStatus: 'registered' });
    expect(onNext).not.toHaveBeenCalled();

    rerender(
      <WelcomeStep
        data={{
          ...baseData,
          businessName: 'North Shore Studio',
          country: 'Australia',
          gstRegistrationStatus: 'registered',
        }}
        onDataChange={onDataChange}
        onNext={onNext}
      />
    );

    expect(screen.getByText('Default tax rate set to 10% for Australia.')).toBeInTheDocument();
    expect(screen.getByTestId('onboarding-submit')).toBeEnabled();
    await user.click(screen.getByTestId('onboarding-submit'));
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});
