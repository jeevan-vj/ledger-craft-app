import { Link, useLocation } from 'react-router-dom';
import { useBusinessProfileQuery } from '@/features/app-data/useLedgerQueries';
import { needsGstFilingSettings } from './gstFilingSettings';

export function GstFilingSettingsNotice({ message }: { message?: string }) {
  return (
    <div role="status" className="rounded-2xl border border-border bg-card p-4">
      <p className="text-sm text-foreground">{message ?? 'This business is GST registered, but the IRD accounting basis, filing frequency and period-ending month are not saved. Tax invoices stay drafts until you confirm them.'}</p>
      <Link to="/tax-config" className="mt-3 inline-flex text-sm font-medium text-primary underline">Open GST settings</Link>
    </div>
  );
}

export function GstFilingSettingsBanner() {
  const profile = useBusinessProfileQuery();
  const { pathname } = useLocation();
  if (pathname === '/tax-config' || !needsGstFilingSettings(profile.data ?? null)) return null;
  return <div className="mb-6"><GstFilingSettingsNotice /></div>;
}
