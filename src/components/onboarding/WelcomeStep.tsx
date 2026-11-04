import React from 'react';
import { Building2, Globe } from 'lucide-react';
import { OnboardingStepProps } from '../../types';
import { businessTaxDefaults } from '@/utils/countryTaxDefaults';

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
  isLoading,
}: OnboardingStepProps) {
  const gstStatus = data.gstRegistrationStatus ?? 'unknown';
  const tax = businessTaxDefaults(data.country, gstStatus);
  const isValid = data.businessName.trim().length >= 2 && gstStatus !== 'unknown';

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
            onChange={(e) => onDataChange({ country: e.target.value })}
            className="block w-full pl-10 pr-3 py-3 border border-border rounded-xl bg-muted/40 text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent appearance-none"
          >
            {countries.map((country) => (
              <option key={country} value={country}>
                {country}
              </option>
            ))}
          </select>
        </div>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-foreground">Are you registered for GST?</legend>
        <GstChoice
          testId="onboarding-gst-registered"
          selected={gstStatus === 'registered'}
          title="Yes, calculate GST"
          body="Use the country tax default on new transactions."
          onSelect={() => onDataChange({ gstRegistrationStatus: 'registered' })}
        />
        <GstChoice
          testId="onboarding-gst-not-registered"
          selected={gstStatus === 'not_registered'}
          title="No, I’m not registered"
          body="New transactions will not add GST by default."
          onSelect={() => onDataChange({ gstRegistrationStatus: 'not_registered' })}
        />
        {gstStatus === 'registered' && (
          <p className="text-sm text-muted-foreground">
            Default tax rate set to {tax.defaultTaxRate}% for {data.country}.
          </p>
        )}
        {gstStatus === 'not_registered' && (
          <p className="text-sm text-muted-foreground">New invoices will not add GST by default.</p>
        )}
      </fieldset>

      {data.businessEmail && (
        <p className="text-sm text-muted-foreground" data-testid="onboarding-email-hint">
          Invoices will use {data.businessEmail}
        </p>
      )}

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
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

function GstChoice({
  testId,
  selected,
  title,
  body,
  onSelect,
}: {
  testId: string;
  selected: boolean;
  title: string;
  body: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left focus:outline-none focus:ring-2 focus:ring-primary ${
        selected ? 'border-primary bg-primary/5' : 'border-border bg-muted/40'
      }`}
    >
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
          selected ? 'border-primary' : 'border-muted-foreground'
        }`}
        aria-hidden="true"
      >
        {selected && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
      </span>
      <span>
        <span className="block text-sm font-medium text-foreground">{title}</span>
        <span className="block text-sm text-muted-foreground">{body}</span>
      </span>
    </button>
  );
}
