import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, usePreventRemove, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GroupedSection, ListRow, ModernButton, ModernInput } from '@/components/ui';
import { bankingApi } from '@/features/banking/api/bankingApi';
import { emptyTransferDraft, transferPayload, validateTransferDraft } from '@/features/banking/model/bankingForms';
import type { MoreStackParamList } from '@/navigation/types';
import { useTheme } from '@/theme';
import { space } from '@/theme/tokens';

type Navigation = NativeStackNavigationProp<MoreStackParamList, 'BankTransferCreate'>;
type Route = RouteProp<MoreStackParamList, 'BankTransferCreate'>;

export default function BankTransferFormScreen() {
  const theme = useTheme(); const navigation = useNavigation<Navigation>(); const queryClient = useQueryClient(); const { sourceAccountId } = useRoute<Route>().params;
  const initial = useRef(emptyTransferDraft()).current; const [draft, setDraft] = useState(initial); const [saved, setSaved] = useState(false); const key = useRef(`mobile-transfer-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const accounts = useQuery({ queryKey: ['banking', 'accounts'], queryFn: bankingApi.listAccounts });
  const source = accounts.data?.find((account) => account.id === sourceAccountId);
  const destinations = accounts.data?.filter((account) => account.id !== sourceAccountId && account.isActive && account.currency === source?.currency) ?? [];
  const errors = useMemo(() => validateTransferDraft(draft, sourceAccountId), [draft, sourceAccountId]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  usePreventRemove(dirty && !saved, ({ data }) => Alert.alert('Discard transfer?', 'Your unsaved transfer details will be lost.', [{ text: 'Keep editing', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(data.action) }]));
  useEffect(() => { if (saved) navigation.goBack(); }, [navigation, saved]);
  const mutation = useMutation({ mutationFn: () => bankingApi.createTransfer(transferPayload(draft, sourceAccountId), key.current), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['banking'] }); setSaved(true); } });
  const set = <K extends keyof typeof draft>(field: K, value: typeof draft[K]) => setDraft((current) => ({ ...current, [field]: value }));
  return <ScrollView style={{ backgroundColor: theme.colors.background }} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <GroupedSection title="From"><ListRow label={source?.accountName ?? 'Loading account…'} value={source?.currency} showChevron={false} /></GroupedSection>
    <GroupedSection title="To" footer={errors.destinationAccountId ?? 'Only active accounts in the same currency are available.'}>
      {destinations.map((account) => <Pressable key={account.id} accessibilityRole="radio" accessibilityState={{ selected: draft.destinationAccountId === account.id }} onPress={() => set('destinationAccountId', account.id)}><ListRow label={account.accountName} subtitle={account.bankName} value={draft.destinationAccountId === account.id ? 'Selected' : account.currency} showChevron={false} /></Pressable>)}
      {!destinations.length ? <View style={styles.empty}><Text style={theme.type.subhead}>Add another active {source?.currency ?? ''} account to make a transfer.</Text></View> : null}
    </GroupedSection>
    <GroupedSection title="Transfer details"><View style={styles.fields}>
      <ModernInput label="Amount" value={draft.amount} onChangeText={(value) => set('amount', value)} keyboardType="decimal-pad" error={errors.amount} />
      <ModernInput label="Date" value={draft.transactionDate} onChangeText={(value) => set('transactionDate', value)} error={errors.transactionDate} />
      <ModernInput label="Description" value={draft.description} onChangeText={(value) => set('description', value)} autoCapitalize="sentences" error={errors.description} />
      <ModernInput label="Reference" value={draft.reference} onChangeText={(value) => set('reference', value)} autoCapitalize="characters" />
    </View></GroupedSection>
    {mutation.error ? <Text accessibilityLiveRegion="polite" style={[theme.type.footnote, { color: theme.colors.danger, marginBottom: space.lg }]}>{mutation.error.message}</Text> : null}
    <ModernButton fullWidth size="lg" onPress={() => mutation.mutate()} loading={mutation.isPending} disabled={Object.keys(errors).length > 0}>Transfer money</ModernButton>
  </ScrollView>;
}

const styles = StyleSheet.create({ content: { padding: space.screen, paddingBottom: 48 }, fields: { padding: space.lg, paddingBottom: 0 }, empty: { padding: space.lg } });
