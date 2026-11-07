import { useAuth } from '@/context/StableAuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { ledgerQueryKeys } from '@/features/app-data/useLedgerQueries';
import { PageHeader } from '@/components/layout/PageHeader';
import { GstSettingsForm } from '@/features/tax/GstSettingsForm';
import { useStore } from '@/lib/store';

export default function TaxConfigurationPage() {
  const queryClient = useQueryClient(); const { me } = useAuth();
  const canWrite = me?.permissions.includes('settings.write') === true;
  return <div className="space-y-6"><PageHeader title="GST settings" description="Registered accounting basis and taxable periods" /><GstSettingsForm canWrite={canWrite} onSaved={() => { void queryClient.invalidateQueries({ queryKey: ledgerQueryKeys.businessProfile }); const store = useStore.getState(); if (store.user) void store.fetchBusinessProfile(); }} /></div>;
}
