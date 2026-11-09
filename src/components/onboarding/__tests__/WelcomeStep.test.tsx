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
  it('asks an NZ registered business for basis, frequency and period end, and does not save a suggested default', async () => {
    const user = userEvent.setup();
    const onDataChange = vi.fn();
    const { rerender } = render(<WelcomeStep data={{ ...baseData, businessName: 'Kauri Studio', gstRegistrationStatus: 'registered' }} onDataChange={onDataChange} onNext={vi.fn()} />);
    expect(screen.getByLabelText('NZ GST number')).toBeInTheDocument();
    expect(screen.getByLabelText('Accounting basis')).toHaveValue('');
    expect(screen.getByLabelText('Filing frequency')).toHaveValue('');
    expect(screen.getByLabelText('Period-ending month')).toHaveValue('');
    expect(screen.getByText(/payments basis, two-monthly filing, and a period ending in March are common/i)).toBeInTheDocument();
    expect(onDataChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('onboarding-submit')).toBeDisabled();
    rerender(<WelcomeStep data={{ ...baseData, businessName: 'Kauri Studio', gstRegistrationStatus: 'registered', taxId: '49098576', gstRegisteredFrom: '2026-04-01' }} onDataChange={onDataChange} onNext={vi.fn()} />);
    expect(screen.getByTestId('onboarding-submit')).toBeDisabled();
    await user.selectOptions(screen.getByLabelText('Accounting basis'), 'payments');
    await user.selectOptions(screen.getByLabelText('Filing frequency'), 'two_monthly');
    await user.selectOptions(screen.getByLabelText('Period-ending month'), '3');
    expect(onDataChange).toHaveBeenCalledWith({ gstAccountingBasis: 'payments' });
    expect(onDataChange).toHaveBeenCalledWith({ gstFilingFrequency: 'two_monthly' });
    expect(onDataChange).toHaveBeenCalledWith({ gstPeriodAnchor: 3 });
    rerender(<WelcomeStep data={{ ...baseData, businessName: 'Kauri Studio', gstRegistrationStatus: 'registered', taxId: '49098576', gstRegisteredFrom: '2026-04-01', gstAccountingBasis: 'payments', gstFilingFrequency: 'two_monthly', gstPeriodAnchor: 3 }} onDataChange={onDataChange} onNext={vi.fn()} />);
    expect(screen.getByTestId('onboarding-submit')).toBeEnabled();
  });

  it('skips IRD filing choices when the business is not GST registered', () => {
    render(<WelcomeStep data={{ ...baseData, businessName: 'Kauri Studio', gstRegistrationStatus: 'not_registered' }} onDataChange={vi.fn()} onNext={vi.fn()} />);
    expect(screen.queryByLabelText('Accounting basis')).not.toBeInTheDocument();
    expect(screen.getByTestId('onboarding-submit')).toBeEnabled();
  });
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
