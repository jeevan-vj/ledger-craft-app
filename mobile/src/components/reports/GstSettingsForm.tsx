import React, { useState } from 'react';
import { Text, View } from 'react-native';
import type { GstSettingsDto } from '@ledgercraft/contracts';
import { ModernInput } from '@/components/ui/ModernInput';
import { ModernButton } from '@/components/ui/ModernButton';
import { gstWorkspaceApi } from '@/features/reports/api/gstWorkspaceApi';
import { space, useTheme } from '@/theme';

export function GstSettingsForm({ settings, onSaved }: { settings: GstSettingsDto; onSaved: () => Promise<void> }) {
 const theme = useTheme();
 const [registration, setRegistration] = useState(settings.gstRegistrationStatus);
 const [taxId, setTaxId] = useState(settings.taxId ?? ''); const [from, setFrom] = useState(settings.gstRegisteredFrom ?? '');
 const [basis, setBasis] = useState(settings.gstAccountingBasis); const [frequency, setFrequency] = useState(settings.gstFilingFrequency);
 const [anchor, setAnchor] = useState(settings.gstPeriodAnchor == null ? '' : String(settings.gstPeriodAnchor));
 const [busy, setBusy] = useState(false); const [error, setError] = useState('');
 async function save() {
  setBusy(true); setError('');
  try {
   if (anchor && !/^(?:[1-9]|1[0-2])$/.test(anchor)) throw new Error('GST period anchor must be a month from 1 to 12.');
   await gstWorkspaceApi.saveSettings({ gstRegistrationStatus: registration, taxId: taxId.trim() || null, gstRegisteredFrom: from.trim() || null, gstAccountingBasis: basis, gstFilingFrequency: frequency, gstPeriodAnchor: anchor ? Number(anchor) : null });
   await onSaved();
  } catch (caught) { setError(caught instanceof Error ? caught.message : 'GST settings could not be saved.'); }
  finally { setBusy(false); }
 }
 return <View style={{ gap: space.md }}>
  <Text style={theme.type.headline}>Registered GST settings</Text>
  <Text style={theme.type.subhead}>Copy the basis, frequency and period ending month from your IRD registration. Saving changes these settings explicitly.</Text>
  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>{(['registered', 'not_registered', 'unknown'] as const).map(value => <ModernButton key={value} size="sm" variant={registration === value ? 'primary' : 'secondary'} disabled={busy} onPress={() => setRegistration(value)}>{value === 'registered' ? 'GST registered' : value === 'not_registered' ? 'Not registered' : 'Registration unknown'}</ModernButton>)}</View>
  {registration === 'registered' ? <>
   <ModernInput label="NZ GST number" value={taxId} onChangeText={setTaxId} editable={!busy} keyboardType="number-pad" placeholder="49091850" />
   <ModernInput label="GST registered from" value={from} onChangeText={setFrom} editable={!busy} placeholder="YYYY-MM-DD" />
   <Text style={theme.type.callout}>Registered accounting basis</Text>
   <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>{(['invoice', 'payments', 'hybrid'] as const).map(value => <ModernButton key={value} size="sm" disabled={busy} variant={basis === value ? 'primary' : 'secondary'} onPress={() => setBasis(value)}>{value === 'invoice' ? 'Invoice' : value === 'payments' ? 'Payments' : 'Hybrid'}</ModernButton>)}</View>
   <Text style={theme.type.callout}>Filing frequency</Text>
   <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>{(['monthly', 'two_monthly', 'six_monthly'] as const).map(value => <ModernButton key={value} size="sm" disabled={busy} variant={frequency === value ? 'primary' : 'secondary'} onPress={() => setFrequency(value)}>{value === 'monthly' ? 'Monthly' : value === 'two_monthly' ? 'Two-monthly' : 'Six-monthly'}</ModernButton>)}</View>
   <ModernInput label="GST period ending month (1 to 12)" value={anchor} onChangeText={setAnchor} editable={!busy} keyboardType="number-pad" />
  </> : null}
  {error ? <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{error}</Text> : null}
  <ModernButton loading={busy} disabled={busy} onPress={() => void save()}>Save GST settings</ModernButton>
 </View>;
}
