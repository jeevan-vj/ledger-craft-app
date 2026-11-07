import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppPressable, EmptyState, FilterPills, GroupedSection, ModernButton, ModernInput } from '@/components/ui';
import { bankingApi, type BankTransactionDto, type BankTransactionSuggestion, type ReconciliationDirection, type ReconciliationStatus } from '@/features/banking/api/bankingApi';
import { cents } from '@/features/banking/model/reconciliationMath';
import type { MoreStackParamList } from '@/navigation/types';
import { useTheme } from '@/theme';
import { control, radius, space } from '@/theme/tokens';

type Navigation = NativeStackNavigationProp<MoreStackParamList, 'BankReconciliation'>;

function directPayload(transaction: BankTransactionDto, suggestion: BankTransactionSuggestion) {
  if ((suggestion.type === 'invoice' || suggestion.type === 'bill') && suggestion.amount && cents(suggestion.amount) === cents(transaction.amount)) return { allocations: [{ documentType: suggestion.type, documentId: suggestion.id, amount: transaction.amount }], splits: [] };
  if (suggestion.type === 'matching_rule' && suggestion.targetAccountId) return { allocations: [], splits: [{ accountId: suggestion.targetAccountId, amount: transaction.amount }] };
  return null;
}

export default function BankReconciliationScreen() {
  const theme = useTheme();
  const navigation = useNavigation<Navigation>();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ReconciliationStatus>('unreconciled');
  const [direction, setDirection] = useState<ReconciliationDirection>('any');
  const [accountId, setAccountId] = useState('');
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [search, setSearch] = useState(''); const [appliedSearch, setAppliedSearch] = useState('');
  const [page, setPage] = useState(1);
  const accounts = useQuery({ queryKey: ['banking', 'accounts'], queryFn: bankingApi.listAccounts });
  const feed = useQuery({
    queryKey: ['banking', 'reconciliation', status, direction, accountId, from, to, appliedSearch, page],
    queryFn: async () => {
      const result = await bankingApi.listReconciliationTransactions({ status, direction, bankAccountId: accountId || undefined, from: from || undefined, to: to || undefined, search: appliedSearch || undefined, page, pageSize: 20 });
      const suggestions = await bankingApi.suggestionsBatch(result.transactions.filter((item) => !item.isReconciled).map((item) => item.id));
      return { ...result, suggestions };
    },
  });
  const accept = useMutation({
    networkMode: 'always',
    mutationFn: ({ transaction, suggestion }: { transaction: BankTransactionDto; suggestion: BankTransactionSuggestion }) => {
      const payload = directPayload(transaction, suggestion);
      if (!payload) throw new Error('Open this transaction to review the suggested match.');
      return bankingApi.acceptSuggestion(transaction.id, payload);
    },
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['banking', 'reconciliation'] }),
  });
  const pagination = feed.data?.pagination;
  const statusOptions = useMemo(() => ([
    { id: 'unreconciled', label: 'Unreconciled' }, { id: 'suggested', label: 'Suggested' }, { id: 'reconciled', label: 'Reconciled' },
  ]), []);
  const directionOptions = useMemo(() => ([{ id: 'any', label: 'In & out' }, { id: 'credit', label: 'Money in' }, { id: 'debit', label: 'Money out' }]), []);

  const header = <View style={styles.header}>
    <View style={styles.titleRow}><Text style={theme.type.headline}>Transaction feed</Text><AppPressable accessibilityRole="button" onPress={() => navigation.navigate('BankMatchingRules')} style={styles.rules}><Feather name="sliders" size={16} color={theme.colors.accentText} /><Text style={[theme.type.callout, { color: theme.colors.accentText }]}>Rules</Text></AppPressable></View>
    <GroupedSection title="Filters" footer={`${pagination?.total ?? 0} bank ${pagination?.total === 1 ? 'line' : 'lines'}`}>
      <View style={styles.filters}>
        <Text style={theme.type.caption}>STATUS</Text><FilterPills options={statusOptions.map((item) => item.id) as ReconciliationStatus[]} value={status} labels={Object.fromEntries(statusOptions.map((item) => [item.id, item.label]))} onChange={(value) => { setStatus(value); setPage(1); }} />
        <Text style={theme.type.caption}>MONEY</Text><FilterPills options={directionOptions.map((item) => item.id) as ReconciliationDirection[]} value={direction} labels={Object.fromEntries(directionOptions.map((item) => [item.id, item.label]))} onChange={(value) => { setDirection(value); setPage(1); }} />
        <Text style={theme.type.caption}>ACCOUNT</Text><FilterPills options={['', ...(accounts.data ?? []).map((item) => item.id)]} value={accountId} labels={Object.fromEntries([['', 'All accounts'], ...(accounts.data ?? []).map((item) => [item.id, item.accountName])])} onChange={(value) => { setAccountId(value); setPage(1); }} />
        <View style={styles.dateRow}><View style={styles.grow}><ModernInput label="From (YYYY-MM-DD)" value={from} onChangeText={(value) => { setFrom(value); setPage(1); }} /></View><View style={styles.grow}><ModernInput label="To (YYYY-MM-DD)" value={to} onChangeText={(value) => { setTo(value); setPage(1); }} /></View></View>
        <View style={[styles.search, { backgroundColor: theme.colors.fillMuted }]}><Feather name="search" size={18} color={theme.colors.textTertiary} /><TextInput accessibilityLabel="Search transactions" placeholder="Description or reference" placeholderTextColor={theme.colors.textTertiary} value={search} onChangeText={setSearch} onSubmitEditing={() => { setAppliedSearch(search.trim()); setPage(1); }} style={[theme.type.body, styles.searchInput]} /><AppPressable accessibilityRole="button" onPress={() => { setAppliedSearch(search.trim()); setPage(1); }} style={styles.apply}><Text style={[theme.type.callout, { color: theme.colors.accentText }]}>Apply</Text></AppPressable></View>
      </View>
    </GroupedSection>
    {accept.error ? <Text accessibilityLiveRegion="polite" style={[theme.type.footnote, { color: theme.colors.danger }]}>{accept.error.message}</Text> : null}
  </View>;

  return <FlatList
    style={{ backgroundColor: theme.colors.background }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}
    data={feed.data?.transactions ?? []} keyExtractor={(item) => item.id} ListHeaderComponent={header}
    refreshing={feed.isFetching} onRefresh={() => feed.refetch()}
    ListEmptyComponent={feed.isLoading ? <ActivityIndicator color={theme.colors.accentText} style={styles.state} /> : feed.error ? <EmptyState icon="alert-circle" title="Could not load transactions" description={feed.error.message} actionLabel="Try again" onAction={() => feed.refetch()} /> : <EmptyState icon="check-circle" title="No transactions in this view" description="Try another status, account, date range, or search." />}
    renderItem={({ item }) => {
      const top = feed.data?.suggestions[item.id]?.suggestions[0];
      const payload = top ? directPayload(item, top) : null;
      return <AppPressable accessibilityRole="button" accessibilityHint="Opens reconciliation details" onPress={() => navigation.navigate('BankReconciliationMatch', { transactionId: item.id })} style={({ pressed }) => [styles.row, { backgroundColor: theme.colors.surface }, pressed && { opacity: 0.7 }]}>
        <View style={styles.rowTop}><View style={styles.rowCopy}><Text style={theme.type.callout}>{item.description}</Text><Text style={theme.type.footnote}>{item.transactionDate}{item.reference ? ` · ${item.reference}` : ''}</Text></View><Text style={[theme.type.headline, styles.amount, { color: item.type === 'credit' ? theme.colors.success : theme.colors.text }]}>{item.type === 'credit' ? '+' : '−'}${item.amount}</Text></View>
        <View style={styles.rowBottom}><View style={[styles.badge, { backgroundColor: item.isReconciled ? theme.colors.successFill : top ? theme.colors.infoFill : theme.colors.fillMuted }]}><Text style={[theme.type.caption, { color: item.isReconciled ? theme.colors.success : top ? theme.colors.info : theme.colors.textSecondary }]}>{item.isReconciled ? 'Reconciled' : top ? `${top.score}% · ${top.type === 'matching_rule' ? 'Rule suggestion' : 'Suggested match'}` : 'Needs review'}</Text></View>{top && payload && top.score >= 80 && !item.isReconciled ? <ModernButton size="sm" onPress={() => accept.mutate({ transaction: item, suggestion: top })} loading={accept.isPending && accept.variables?.transaction.id === item.id}>Accept</ModernButton> : <Feather name="chevron-right" size={20} color={theme.colors.textTertiary} />}</View>
      </AppPressable>;
    }}
    ListFooterComponent={pagination && pagination.totalPages > 1 ? <View style={styles.pager}><ModernButton variant="outline" size="sm" disabled={page <= 1} onPress={() => setPage((value) => value - 1)}>Previous</ModernButton><Text style={theme.type.footnote}>Page {pagination.page} of {pagination.totalPages}</Text><ModernButton variant="outline" size="sm" disabled={page >= pagination.totalPages} onPress={() => setPage((value) => value + 1)}>Next</ModernButton></View> : null}
  />;
}

const styles = StyleSheet.create({ content: { padding: space.screen, paddingBottom: 64, gap: space.md }, header: { gap: space.lg, marginBottom: space.md }, titleRow: { minHeight: control.touchTarget, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, rules: { minHeight: control.touchTarget, flexDirection: 'row', alignItems: 'center', gap: space.sm }, filters: { padding: space.lg, gap: space.sm }, dateRow: { flexDirection: 'row', gap: space.md }, grow: { flex: 1 }, search: { minHeight: control.default, borderRadius: radius.md, paddingLeft: space.md, flexDirection: 'row', alignItems: 'center' }, searchInput: { flex: 1, paddingHorizontal: space.sm }, apply: { minHeight: control.touchTarget, justifyContent: 'center', paddingHorizontal: space.md }, row: { padding: space.lg, borderRadius: radius.group, gap: space.md }, rowTop: { flexDirection: 'row', gap: space.md }, rowCopy: { flex: 1 }, amount: { fontVariant: ['tabular-nums'], fontSize: 20 }, rowBottom: { minHeight: control.touchTarget, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm }, badge: { borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.sm }, pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: space.lg }, state: { padding: 64 } });
