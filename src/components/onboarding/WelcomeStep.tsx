import React from 'react';
import { Building2, Globe } from 'lucide-react';
import { OnboardingStepProps } from '../../types';
import { getDefaultTaxRate } from '@/utils/countryTaxDefaults';

const countries = [
  'New Zealand',
  'Australia',
  'United States',
  'United Kingdom',
  'Canada',
  'Germany',
  'France',
  'Japan',
  'Singapore',
  'India',
  'Other',
];

export default function WelcomeStep({
  data,
  onDataChange,
  onNext,
  onSkip,
  isLoading,
}: OnboardingStepProps) {
  const isValid = data.businessName.trim().length >= 2;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isValid) {
      onNext();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="businessName" className="block text-sm font-medium text-foreground mb-2">
          Business name <span className="text-destructive">*</span>
        </label>
        <div className="relative">
          <Building2 className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
          <input
            type="text"
            id="businessName"
            data-testid="onboarding-business-name"
            value={data.businessName}
            onChange={(e) => onDataChange({ businessName: e.target.value })}
            className="block w-full pl-10 pr-3 py-3 border border-border rounded-xl bg-muted/40 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            placeholder="North Shore Studio"
            required
            autoFocus
          />
        </div>
      </div>

      <div>
        <label htmlFor="country" className="block text-sm font-medium text-foreground mb-2">
          Country
        </label>
        <div className="relative">
          <Globe className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
          <select
            id="country"
            data-testid="onboarding-country"
            value={data.country}
            onChange={(e) =>
              onDataChange({
                country: e.target.value,
                defaultTaxRate: getDefaultTaxRate(e.target.value),
              })
            }
            className="block w-full pl-10 pr-3 py-3 border border-border rounded-xl bg-muted/40 text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent appearance-none"
          >
            {countries.map((country) => (
              <option key={country} value={country}>
                {country}
              </option>
            ))}
          </select>
        </div>
        {data.defaultTaxRate != null && (
          <p className="text-sm text-muted-foreground mt-2">
            Default tax rate set to {data.defaultTaxRate}% for {data.country}.
          </p>
        )}
      </div>

      {data.businessEmail && (
        <p className="text-sm text-muted-foreground" data-testid="onboarding-email-hint">
          Invoices will use {data.businessEmail}
        </p>
      )}

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
        {onSkip && (
          <button
            type="button"
            data-testid="onboarding-skip"
            onClick={onSkip}
            disabled={isLoading}
            className="px-4 py-3 text-muted-foreground hover:text-foreground rounded-xl focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
          >
            I will do this later
          </button>
        )}
        <button
          type="submit"
          data-testid="onboarding-submit"
          disabled={!isValid || isLoading}
          className="px-6 py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Saving...' : 'Get started'}
        </button>
      </div>
    </form>
  );
}
