import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, usePreventRemove, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GroupedSection, ListRow, ModernButton, ModernInput } from '@/components/ui';
import { bankingApi } from '@/features/banking/api/bankingApi';
import { emptyTransactionDraft, transactionDraftFromRecord, transactionPayload, validateTransactionDraft } from '@/features/banking/model/bankingForms';
import type { MoreStackParamList } from '@/navigation/types';
import { useTheme } from '@/theme';
import { space } from '@/theme/tokens';

type Navigation = NativeStackNavigationProp<MoreStackParamList>;
type Route = RouteProp<MoreStackParamList, 'BankTransactionCreate' | 'BankTransactionEdit'>;

export default function BankTransactionFormScreen() {
  const theme = useTheme(); const navigation = useNavigation<Navigation>(); const route = useRoute<Route>(); const queryClient = useQueryClient();
  const bankAccountId = route.params.bankAccountId; const transactionId = route.name === 'BankTransactionEdit' ? (route.params as MoreStackParamList['BankTransactionEdit']).transactionId : undefined;
  const [initial, setInitial] = useState(emptyTransactionDraft); const [draft, setDraft] = useState(initial);
  const [shouldClose, setShouldClose] = useState(false);
  const existing = useQuery({ queryKey: ['banking', 'transaction', transactionId], queryFn: () => bankingApi.getTransaction(transactionId!), enabled: Boolean(transactionId) });
  useEffect(() => { if (existing.data) { const value = transactionDraftFromRecord(existing.data); setInitial(value); setDraft(value); } }, [existing.data]);
  const errors = useMemo(() => validateTransactionDraft(draft), [draft]); const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  useEffect(() => { if (shouldClose && !dirty) navigation.goBack(); }, [dirty, navigation, shouldClose]);
  usePreventRemove(dirty, ({ data }) => Alert.alert('Discard transaction changes?', 'Your unsaved changes will be lost.', [{ text: 'Keep editing', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(data.action) }]));
  const save = useMutation({ mutationFn: async () => { const payload = transactionPayload(draft, bankAccountId); if (!transactionId) return bankingApi.createTransaction(payload); const { bankAccountId: _ignored, ...patch } = payload; return bankingApi.updateTransaction(transactionId, patch); }, onSuccess: async () => { setInitial(draft); setShouldClose(true); await queryClient.invalidateQueries({ queryKey: ['banking'] }); } });
  const remove = useMutation({ mutationFn: () => bankingApi.removeTransaction(transactionId!), onSuccess: async () => { setInitial(draft); setShouldClose(true); await queryClient.invalidateQueries({ queryKey: ['banking'] }); } });
  const submit = () => { if (Object.keys(errors).length) return; save.mutate(); };
  const set = <K extends keyof typeof draft>(key: K, value: typeof draft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const confirmDelete = () => Alert.alert('Delete transaction?', 'The account balance will be reversed. This cannot be undone.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => remove.mutate() }]);

  return <ScrollView style={{ backgroundColor: theme.colors.background }} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <GroupedSection title="Direction" footer="Income adds to this account. Expense subtracts from it.">
      <Pressable accessibilityRole="radio" accessibilityState={{ selected: draft.type === 'credit' }} onPress={() => set('type', 'credit')}><ListRow label="Income" value={draft.type === 'credit' ? 'Selected' : undefined} showChevron={false} /></Pressable>
      <Pressable accessibilityRole="radio" accessibilityState={{ selected: draft.type === 'debit' }} onPress={() => set('type', 'debit')}><ListRow label="Expense" value={draft.type === 'debit' ? 'Selected' : undefined} showChevron={false} /></Pressable>
    </GroupedSection>
    <GroupedSection title="Transaction">
      <View style={styles.fields}>
        <ModernInput label="Amount" value={draft.amount} onChangeText={(value) => set('amount', value)} keyboardType="decimal-pad" error={errors.amount} />
        <ModernInput label="Date" value={draft.transactionDate} onChangeText={(value) => set('transactionDate', value)} autoCapitalize="none" error={errors.transactionDate} />
        <ModernInput label="Description" value={draft.description} onChangeText={(value) => set('description', value)} autoCapitalize="sentences" error={errors.description} />
        <ModernInput label="Category" value={draft.category} onChangeText={(value) => set('category', value)} autoCapitalize="words" />
        <ModernInput label="Counterparty" value={draft.counterparty} onChangeText={(value) => set('counterparty', value)} autoCapitalize="words" />
        <ModernInput label="Reference" value={draft.reference} onChangeText={(value) => set('reference', value)} autoCapitalize="characters" />
        <ModernInput label="Notes" value={draft.notes} onChangeText={(value) => set('notes', value)} autoCapitalize="sentences" multiline />
      </View>
    </GroupedSection>
    {(save.error || remove.error) ? <Text accessibilityLiveRegion="polite" style={[theme.type.footnote, { color: theme.colors.danger, marginBottom: space.lg }]}>{(save.error || remove.error)?.message}</Text> : null}
    <ModernButton fullWidth size="lg" onPress={submit} loading={save.isPending} disabled={Object.keys(errors).length > 0}>{transactionId ? 'Save transaction' : 'Add transaction'}</ModernButton>
    {transactionId ? <Pressable accessibilityRole="button" onPress={confirmDelete} disabled={remove.isPending} style={styles.delete}><Text style={[theme.type.callout, { color: theme.colors.danger }]}>{remove.isPending ? 'Deleting…' : 'Delete transaction'}</Text></Pressable> : null}
  </ScrollView>;
}

const styles = StyleSheet.create({ content: { padding: space.screen, paddingBottom: 48 }, fields: { padding: space.lg, paddingBottom: 0 }, delete: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: space.lg } });
