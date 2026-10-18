import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, usePreventRemove, useRoute, type NavigationAction, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FormSwitch } from '@/components/ui/FormSwitch';
import { ModernButton } from '@/components/ui/ModernButton';
import { ModernInput } from '@/components/ui/ModernInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { customerService } from '@/services/customerService';
import type { CustomerStackParamList } from '@/navigation/types';
import { hasCustomerFormChanged, type CustomerDraft, validateCustomerDraft } from '@/features/customers/model/customerForms';
import { space } from '@/theme/tokens';
import { errorHaptic, successHaptic } from '@/utils/haptics';
import { useTheme } from '@/theme';

type Navigation = NativeStackNavigationProp<CustomerStackParamList, 'CustomerCreate'>;
type Route = RouteProp<CustomerStackParamList, 'CustomerCreate' | 'CustomerEdit'>;
const emptyCustomer = (): CustomerDraft => ({ name: '', email: '', phone: '', address: '', city: '', state: '', zip: '', country: 'NZ', isVip: false });

export default function CustomerFormScreen() {
  const theme = useTheme();
  const navigation = useNavigation<Navigation>();
  const route = useRoute<Route>();
  const customerId = route.name === 'CustomerEdit' ? (route.params as CustomerStackParamList['CustomerEdit']).customerId : undefined;
  const [initial, setInitial] = useState<CustomerDraft>(emptyCustomer);
  const [form, setForm] = useState<CustomerDraft>(initial);
  const [loading, setLoading] = useState(Boolean(customerId));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedCustomerId, setSavedCustomerId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<NavigationAction | null>(null);
  const errors = validateCustomerDraft(form);
  const isDirty = hasCustomerFormChanged(form, initial);

  useEffect(() => {
    if (!customerId) return;
    let active = true;
    setLoading(true);
    customerService.fetchCustomerById(customerId).then((customer) => {
      if (!active) return;
      const loaded: CustomerDraft = {
        name: customer.name, email: customer.email || '', phone: customer.phone || '', address: customer.address || '',
        city: customer.city || '', state: customer.state || '', zip: customer.zip || '', country: customer.country || 'NZ', isVip: Boolean(customer.isVip),
      };
      setInitial(loaded); setForm(loaded); setLoadError(null);
    }).catch((error) => active && setLoadError(error instanceof Error ? error.message : 'Customer could not be loaded.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [customerId]);

  useEffect(() => {
    if (!pendingNavigation || isDirty) return;
    navigation.dispatch(pendingNavigation);
    setPendingNavigation(null);
  }, [isDirty, navigation, pendingNavigation]);

  useEffect(() => {
    if (savedCustomerId && !isDirty) navigation.replace('CustomerDetail', { customerId: savedCustomerId });
  }, [isDirty, navigation, savedCustomerId]);

  usePreventRemove(isDirty && !saving, ({ data }) => {
    Alert.alert('Discard customer changes?', 'Your unsaved changes will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => { setForm(initial); setPendingNavigation(data.action); } },
    ]);
  });

  const save = async () => {
    setSubmitted(true);
    if (Object.keys(errors).length) return;
    setSaving(true); setSaveError(null);
    try {
      const payload = {
        name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim() || null, address: form.address.trim() || null,
        city: form.city.trim() || null, state: form.state.trim() || null, zip: form.zip.trim() || null, country: form.country.trim(), isVip: form.isVip, tags: [],
      };
      const saved = customerId ? await customerService.updateCustomer(customerId, payload) : await customerService.createCustomer(payload);
      setInitial(form); setSavedCustomerId(saved.id); successHaptic();
    } catch (error) {
      errorHaptic(); setSaveError(error instanceof Error ? error.message : 'Customer could not be saved.');
    } finally { setSaving(false); }
  };

  if (loading) return <View style={[styles.center, { backgroundColor: theme.colors.background }]}><ActivityIndicator size="large" color={theme.colors.accent} accessibilityLabel="Loading customer" /></View>;
  if (loadError) return <View style={[styles.center, { backgroundColor: theme.colors.background }]}><EmptyState title="Couldn’t load this customer" description={loadError} actionLabel="Go back" onAction={() => navigation.goBack()} /></View>;

  return <KeyboardAvoidingView style={[styles.container, { backgroundColor: theme.colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
    <ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <ModernInput label="Customer name" value={form.name} onChangeText={(name) => setForm({ ...form, name })} autoCapitalize="words" autoComplete="name" error={submitted ? errors.name : undefined} />
      <ModernInput label="Email (optional)" value={form.email} onChangeText={(email) => setForm({ ...form, email })} keyboardType="email-address" autoComplete="email" error={submitted ? errors.email : undefined} />
      <ModernInput label="Phone (optional)" value={form.phone} onChangeText={(phone) => setForm({ ...form, phone })} keyboardType="phone-pad" autoComplete="tel" />
      <ModernInput label="Street address (optional)" value={form.address} onChangeText={(address) => setForm({ ...form, address })} autoCapitalize="words" autoComplete="street-address" />
      <View style={styles.row}><View style={styles.flex}><ModernInput label="City" value={form.city} onChangeText={(city) => setForm({ ...form, city })} autoCapitalize="words" /></View><View style={styles.flex}><ModernInput label="Region" value={form.state} onChangeText={(state) => setForm({ ...form, state })} autoCapitalize="words" /></View></View>
      <View style={styles.row}><View style={styles.flex}><ModernInput label="Postcode" value={form.zip} onChangeText={(zip) => setForm({ ...form, zip })} /></View><View style={styles.flex}><ModernInput label="Country" value={form.country} onChangeText={(country) => setForm({ ...form, country })} autoCapitalize="characters" error={submitted ? errors.country : undefined} /></View></View>
      <FormSwitch label="VIP customer" value={form.isVip} onValueChange={(isVip) => setForm({ ...form, isVip })} description="Highlights this customer in contact lists." />
      {saveError ? <Text style={[theme.type.subhead, { color: theme.colors.danger, marginBottom: space.md }]} accessibilityLiveRegion="assertive">{saveError}</Text> : null}
      <ModernButton onPress={save} loading={saving} fullWidth size="lg">{customerId ? 'Save changes' : 'Create customer'}</ModernButton>
    </ScrollView>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({ container: { flex: 1 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, content: { padding: space.screen, paddingBottom: 48 }, row: { flexDirection: 'row', gap: space.md }, flex: { flex: 1 } });
