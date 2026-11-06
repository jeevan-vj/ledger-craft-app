import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { createVendorRequestSchema } from '@ledgercraft/contracts';
import { ModernButton } from '@/components/ui/ModernButton';
import { ModernInput } from '@/components/ui/ModernInput';
import { purchasesApi, type VendorDto } from '@/features/purchases/api/purchasesApi';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme';

export function VendorCreateForm({ onCreated }: { onCreated: (vendor: VendorDto) => void }) {
  const theme = useTheme();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [terms, setTerms] = useState('30');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  async function save() {
    const parsed = createVendorRequestSchema.safeParse({ name: name.trim(), email: email.trim() || null, paymentTermDays: /^\d+$/.test(terms) ? Number(terms) : -1 });
    if (!parsed.success) { setError('Enter a vendor name, valid email (or leave it blank), and payment terms from 0 to 365 days.'); return; }
    setSaving(true);
    setError(undefined);
    try { onCreated(await purchasesApi.createVendor(parsed.data)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Vendor could not be saved. Try again.'); }
    finally { setSaving(false); }
  }
  return <View style={{ padding: space.lg, gap: space.md }}>
    <Text style={theme.type.headline}>Add a vendor</Text>
    <ModernInput label="Vendor name" value={name} onChangeText={setName} />
    <ModernInput label="Vendor email (optional)" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
    <ModernInput label="Payment terms (days)" value={terms} onChangeText={setTerms} keyboardType="number-pad" />
    {error ? <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{error}</Text> : null}
    <ModernButton loading={saving} disabled={saving} onPress={() => void save()}>Create vendor</ModernButton>
  </View>;
}
