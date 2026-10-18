import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, usePreventRemove, useRoute, type NavigationAction, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EmptyState, FormSwitch, ListRow, ModernButton, ModernInput } from '@/components/ui';
import { SelectionRow, SelectionSheet } from '@/components/ui/SelectionSheet';
import { bankingApi, type BankAccountType } from '@/features/banking/api/bankingApi';
import { bankAccountDraftFromRecord, bankAccountPayloadFromDraft, emptyBankAccountDraft, hasBankAccountFormChanged, validateBankAccountDraft } from '@/features/banking/model/bankAccountForms';
import type { MoreStackParamList } from '@/navigation/types';
import { useTheme } from '@/theme';
import { space } from '@/theme/tokens';
import { errorHaptic, successHaptic } from '@/utils/haptics';

type Navigation = NativeStackNavigationProp<MoreStackParamList, 'BankAccountCreate'>;
type Route = RouteProp<MoreStackParamList, 'BankAccountCreate' | 'BankAccountEdit'>;
const accountTypes: { value: BankAccountType; label: string }[] = [
  { value: 'business', label: 'Business' }, { value: 'checking', label: 'Checking' },
  { value: 'savings', label: 'Savings' }, { value: 'credit_card', label: 'Credit card' },
];

export default function BankAccountFormScreen() {
  const theme = useTheme(); const navigation = useNavigation<Navigation>(); const route = useRoute<Route>(); const queryClient = useQueryClient();
  const bankAccountId = route.name === 'BankAccountEdit' ? (route.params as MoreStackParamList['BankAccountEdit']).bankAccountId : undefined;
  const [initial, setInitial] = useState(emptyBankAccountDraft); const [form, setForm] = useState(initial);
  const [submitted, setSubmitted] = useState(false); const [typeOpen, setTypeOpen] = useState(false);
  const [typeSearch, setTypeSearch] = useState('');
  const [pendingNavigation, setPendingNavigation] = useState<NavigationAction | null>(null); const [savedId, setSavedId] = useState<string | null>(null);
  const accountQuery = useQuery({ queryKey: ['banking', 'account', bankAccountId], queryFn: () => bankingApi.getAccount(bankAccountId!), enabled: Boolean(bankAccountId) });
  useEffect(() => { if (accountQuery.data) { const loaded = bankAccountDraftFromRecord(accountQuery.data); setInitial(loaded); setForm(loaded); } }, [accountQuery.data]);
  const errors = validateBankAccountDraft(form); const isDirty = hasBankAccountFormChanged(form, initial);
  const saveMutation = useMutation({
    mutationFn: () => bankAccountId ? bankingApi.updateAccount(bankAccountId, bankAccountPayloadFromDraft(form)) : bankingApi.createAccount(bankAccountPayloadFromDraft(form)),
    onSuccess: async (saved) => { setInitial(form); setSavedId(saved.id); await queryClient.invalidateQueries({ queryKey: ['banking'] }); successHaptic(); },
    onError: errorHaptic,
  });
  useEffect(() => { if (!pendingNavigation || isDirty) return; navigation.dispatch(pendingNavigation); setPendingNavigation(null); }, [isDirty, navigation, pendingNavigation]);
  useEffect(() => { if (savedId && !isDirty) navigation.replace('BankAccountDetail', { bankAccountId: savedId }); }, [isDirty, navigation, savedId]);
  usePreventRemove(isDirty && !saveMutation.isPending, ({ data }) => Alert.alert('Discard bank account changes?', 'Your unsaved changes will be lost.', [{ text: 'Keep editing', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: () => { setForm(initial); setPendingNavigation(data.action); } }]));
  const save = () => { setSubmitted(true); if (!Object.keys(errors).length) saveMutation.mutate(); };
  const selectedType = accountTypes.find((item) => item.value === form.accountType)?.label;
  const visibleAccountTypes = accountTypes.filter((item) => item.label.toLowerCase().includes(typeSearch.toLowerCase()));

  if (accountQuery.isLoading) return <View style={[styles.center, { backgroundColor: theme.colors.background }]}><ActivityIndicator color={theme.colors.accent} accessibilityLabel="Loading bank account" /></View>;
  if (accountQuery.error) return <View style={[styles.center, { backgroundColor: theme.colors.background }]}><EmptyState title="Couldn’t load this bank account" description={accountQuery.error.message} actionLabel="Go back" onAction={() => navigation.goBack()} /></View>;
  return <KeyboardAvoidingView style={[styles.container, { backgroundColor: theme.colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
    <ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <ModernInput label="Account name" value={form.accountName} onChangeText={(accountName) => setForm({ ...form, accountName })} autoCapitalize="words" error={submitted ? errors.accountName : undefined} />
      <ModernInput label="Bank name" value={form.bankName} onChangeText={(bankName) => setForm({ ...form, bankName })} autoCapitalize="words" error={submitted ? errors.bankName : undefined} />
      <ModernInput label="Account number" value={form.accountNumber} onChangeText={(accountNumber) => setForm({ ...form, accountNumber })} autoCapitalize="none" error={submitted ? errors.accountNumber : undefined} />
      <View style={[styles.selector, { backgroundColor: theme.colors.surface }]}><ListRow label="Account type" value={selectedType} onPress={() => setTypeOpen(true)} /></View>
      <ModernInput label="Currency" value={form.currency} onChangeText={(currency) => setForm({ ...form, currency: currency.toUpperCase() })} autoCapitalize="characters" maxLength={3} error={submitted ? errors.currency : undefined} />
      <ModernInput label="Opening balance" value={form.openingBalance} onChangeText={(openingBalance) => setForm({ ...form, openingBalance })} keyboardType="numbers-and-punctuation" error={submitted ? errors.openingBalance : undefined} />
      <ModernInput label="Current balance" value={form.currentBalance} onChangeText={(currentBalance) => setForm({ ...form, currentBalance })} keyboardType="numbers-and-punctuation" error={submitted ? errors.currentBalance : undefined} />
      <FormSwitch label="Active" value={form.isActive} onValueChange={(isActive) => setForm({ ...form, isActive })} description="Inactive accounts stay in history but are hidden from the active list." />
      {saveMutation.error ? <Text style={[theme.type.subhead, { color: theme.colors.danger, marginBottom: space.md }]} accessibilityLiveRegion="assertive">{saveMutation.error.message}</Text> : null}
      <ModernButton onPress={save} loading={saveMutation.isPending} fullWidth size="lg">{bankAccountId ? 'Save changes' : 'Create bank account'}</ModernButton>
    </ScrollView>
    <SelectionSheet visible={typeOpen} title="Choose account type" searchPlaceholder="Search account types" searchQuery={typeSearch} onSearchChange={setTypeSearch} onClose={() => { setTypeOpen(false); setTypeSearch(''); }} loading={false} empty={!visibleAccountTypes.length} emptyTitle="No account types">
      {visibleAccountTypes.map((item) => <SelectionRow key={item.value} title={item.label} selected={form.accountType === item.value} onPress={() => { setForm({ ...form, accountType: item.value }); setTypeOpen(false); setTypeSearch(''); }} />)}
    </SelectionSheet>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({ container: { flex: 1 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, content: { padding: space.screen, paddingBottom: 48 }, selector: { borderRadius: 20, overflow: 'hidden', marginBottom: space.lg } });
