import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, usePreventRemove, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GroupedSection, ListRow, ModernButton, ModernInput } from '@/components/ui';
import { currencyApi } from '@/features/currency/currencyApi';
import { bankingApi } from '@/features/banking/api/bankingApi';
import { emptyTransferDraft, transferPayload, validateTransferDraft } from '@/features/banking/model/bankingForms';
import type { MoreStackParamList } from '@/navigation/types';
import { useTabScreenInsets } from '@/hooks/useTabScreenInsets';
import { useTheme } from '@/theme';
import { space } from '@/theme/tokens';

type Navigation = NativeStackNavigationProp<MoreStackParamList, 'BankTransferCreate'>;
type Route = RouteProp<MoreStackParamList, 'BankTransferCreate'>;

export default function BankTransferFormScreen() {
  const { bottomPadding } = useTabScreenInsets();
  const theme = useTheme(); const navigation = useNavigation<Navigation>(); const queryClient = useQueryClient(); const { sourceAccountId } = useRoute<Route>().params;
  const initial = useRef(emptyTransferDraft()).current; const [draft, setDraft] = useState(initial); const [saved, setSaved] = useState(false); const key = useRef(`mobile-transfer-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const accounts = useQuery({ queryKey: ['banking', 'accounts'], queryFn: bankingApi.listAccounts });
  const source = accounts.data?.find((account) => account.id === sourceAccountId);
  const destinations = accounts.data?.filter((account) => account.id !== sourceAccountId && account.isActive) ?? [];
  const destination = destinations.find(a => a.id === draft.destinationAccountId);
  const crossCurrency = !!source && !!destination && source.currency !== destination.currency;
  const currencies = useQuery({ queryKey: ['currency-settings'], queryFn: currencyApi.get, enabled: crossCurrency });
  const rates = currencies.data?.rates.filter(r => r.effectiveDate <= draft.transactionDate && ((r.currencyCode === source?.currency && r.baseCurrency === destination?.currency) || (r.currencyCode === destination?.currency && r.baseCurrency === source?.currency))) ?? [];
  const errors = useMemo(() => validateTransferDraft(draft, sourceAccountId, crossCurrency), [draft, sourceAccountId, crossCurrency]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  usePreventRemove(dirty && !saved, ({ data }) => Alert.alert('Discard transfer?', 'Your unsaved transfer details will be lost.', [{ text: 'Keep editing', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(data.action) }]));
  useEffect(() => { if (saved) navigation.goBack(); }, [navigation, saved]);
  const mutation = useMutation({ networkMode: 'always', mutationFn: () => bankingApi.createTransfer(transferPayload(draft, sourceAccountId), key.current), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['banking'] }); setSaved(true); } });
  const set = <K extends keyof typeof draft>(field: K, value: typeof draft[K]) => setDraft((current) => ({ ...current, [field]: value }));
  return <ScrollView style={{ backgroundColor: theme.colors.background }} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}>
    <GroupedSection title="From"><ListRow label={source?.accountName ?? 'Loading account…'} value={source?.currency} showChevron={false} /></GroupedSection>
    <GroupedSection title="To" footer={errors.destinationAccountId ?? 'Select an active destination. Different currencies require an explicit reviewed rate.'}>
      {destinations.map((account) => <Pressable key={account.id} accessibilityRole="radio" accessibilityState={{ selected: draft.destinationAccountId === account.id }} onPress={() => setDraft(current => ({ ...current, destinationAccountId: account.id, exchangeRateId: undefined }))}><ListRow label={account.accountName} subtitle={account.bankName} value={draft.destinationAccountId === account.id ? 'Selected' : account.currency} showChevron={false} /></Pressable>)}
      {!destinations.length ? <View style={styles.empty}><Text style={theme.type.subhead}>Add another active account to make a transfer.</Text></View> : null}
    </GroupedSection>
    <GroupedSection title="Transfer details"><View style={styles.fields}>
      <ModernInput label="Amount" value={draft.amount} onChangeText={(value) => set('amount', value)} keyboardType="decimal-pad" error={errors.amount} />
      <ModernInput label="Date" value={draft.transactionDate} onChangeText={(value) => set('transactionDate', value)} error={errors.transactionDate} />
      <ModernInput label="Description" value={draft.description} onChangeText={(value) => set('description', value)} autoCapitalize="sentences" error={errors.description} />
      <ModernInput label="Reference" value={draft.reference} onChangeText={(value) => set('reference', value)} autoCapitalize="characters" />
    </View></GroupedSection>
    {crossCurrency && <GroupedSection title="Reviewed transfer exchange rate" footer={errors.exchangeRateId ?? 'The server calculates both currency legs using the selected immutable rate.'}>
      <Text style={[theme.type.footnote, styles.empty]}>Amount is in {source?.currency}. Select a persisted rate dated on or before the transfer date. No live rate is assumed.</Text>
      {rates.map(rate => <ListRow key={rate.id} label={`1 ${rate.currencyCode} = ${rate.rate} ${rate.baseCurrency}`} subtitle={rate.effectiveDate} value={draft.exchangeRateId === rate.id ? 'Selected' : undefined} onPress={() => set('exchangeRateId', rate.id)} showChevron={false} />)}
      {!rates.length && <Text style={[theme.type.footnote, styles.empty]}>No eligible reviewed rate. Add one in Business currency settings, then retry. Transfers between two non-base currencies are unavailable.</Text>}
      {currencies.error && <Text style={{ color: theme.colors.danger }}>{currencies.error.message}</Text>}
      <ModernButton variant="secondary" onPress={() => void currencies.refetch()}>Reload reviewed rates</ModernButton>
    </GroupedSection>}
    {mutation.error ? <Text accessibilityLiveRegion="polite" style={[theme.type.footnote, { color: theme.colors.danger, marginBottom: space.lg }]}>{mutation.error.message}</Text> : null}
    <ModernButton fullWidth size="lg" onPress={() => mutation.mutate()} loading={mutation.isPending} disabled={Object.keys(errors).length > 0 || (crossCurrency && !rates.some(r => r.id === draft.exchangeRateId))}>Transfer money</ModernButton>
  </ScrollView>;
}

const styles = StyleSheet.create({ content: { padding: space.screen, paddingBottom: 48 }, fields: { padding: space.lg, paddingBottom: 0 }, empty: { padding: space.lg } });
