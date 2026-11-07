import React, { useCallback, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EmptyState, GroupedSection, ListRow, ModernButton, ModernInput } from '@/components/ui';
import { NativeHeaderButton } from '@/components/ui/NativeHeaderButton';
import { bankingApi } from '@/features/banking/api/bankingApi';
import { StatementWorkspacePanel } from '@/components/banking/StatementWorkspacePanel';
import type { MoreStackParamList } from '@/navigation/types';
import { useTabScreenInsets } from '@/hooks/useTabScreenInsets';
import { useTheme } from '@/theme';
import { space } from '@/theme/tokens';
import { formatMoney } from '@/utils/money';
import { useStore } from '@/store';

type Navigation = NativeStackNavigationProp<MoreStackParamList, 'BankAccountDetail'>;
type Route = RouteProp<MoreStackParamList, 'BankAccountDetail'>;
const typeLabel = { business: 'Business', checking: 'Checking', savings: 'Savings', credit_card: 'Credit card' } as const;
export default function BankAccountDetailScreen() {
  const { bottomPadding } = useTabScreenInsets();
  const theme = useTheme(); const navigation = useNavigation<Navigation>(); const client = useQueryClient(); const { bankAccountId } = useRoute<Route>().params;
  const canWrite = useStore(s => s.permissions.includes('banking.write')); const [page, setPage] = useState(1);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const [from, setFrom] = useState(`${today.slice(0,7)}-01`); const [to, setTo] = useState(today); const [period, setPeriod] = useState({ from, to });
  const account = useQuery({ queryKey: ['banking', 'account', bankAccountId], queryFn: () => bankingApi.getAccount(bankAccountId) });
  const transactions = useQuery({ queryKey: ['banking', 'transactions', bankAccountId, page], queryFn: () => bankingApi.listReconciliationTransactions({ bankAccountId, page, pageSize: 20 }) });
  const movements = useQuery({ queryKey: ['banking', 'movements', bankAccountId, period], queryFn: () => bankingApi.movements(bankAccountId, period.from, period.to) });
  const defaults = useQuery({ queryKey: ['banking', 'default-account'], queryFn: bankingApi.getDefaultAccount });
  const accountFetched = account.isFetched; const refetchAccount = account.refetch; const transactionsFetched = transactions.isFetched; const refetchTransactions = transactions.refetch;
  useFocusEffect(useCallback(() => { if (accountFetched) void refetchAccount(); if (transactionsFetched) void refetchTransactions(); }, [accountFetched, refetchAccount, refetchTransactions, transactionsFetched]));
  useLayoutEffect(() => navigation.setOptions({ title: account.data?.accountName || 'Bank account', headerRight: account.data && canWrite ? () => <NativeHeaderButton label="Edit" primary onPress={() => navigation.navigate('BankAccountEdit', { bankAccountId })} /> : undefined }), [account.data, bankAccountId, navigation, canWrite]);
  const defaultAccount = useMutation({ networkMode: 'always', mutationFn: () => bankingApi.setDefaultAccount(defaults.data?.bankAccountId === bankAccountId ? null : bankAccountId), onSuccess: () => client.invalidateQueries({ queryKey: ['banking', 'default-account'] }) });
  const remove = useMutation({ networkMode: 'always', mutationFn: () => bankingApi.removeAccount(bankAccountId), onSuccess: async () => { await client.invalidateQueries({ queryKey: ['banking'] }); navigation.goBack(); } });
  if (account.isLoading) return <View style={styles.center}><ActivityIndicator color={theme.colors.accent} accessibilityLabel="Loading bank account details" /></View>;
  if (!account.data) return <View style={styles.center}><EmptyState title="Bank account not found" description={account.error?.message || 'This account may no longer exist.'} actionLabel="Try again" onAction={account.refetch} /></View>;
  const detail = account.data; const pagination = transactions.data?.pagination;
  return <ScrollView style={{ backgroundColor: theme.colors.background }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}>
    <View style={styles.hero}><Feather name="briefcase" size={32} color={theme.colors.accentText} /><Text style={theme.type.money}>{formatMoney(detail.currentBalance, detail.currency)}</Text><Text style={theme.type.caption}>{detail.isActive ? 'ACTIVE' : 'INACTIVE'} · {typeLabel[detail.accountType].toUpperCase()}</Text></View>
    <GroupedSection title="Account"><ListRow label="Bank" value={detail.bankName} showChevron={false} /><ListRow label="Account number" value={detail.accountNumber} showChevron={false} /><ListRow label="Currency" value={detail.currency} showChevron={false} /><ListRow label="Opening balance" value={formatMoney(detail.openingBalance, detail.currency)} showChevron={false} />{defaults.data?.bankAccountId === bankAccountId && <ListRow label="Default payment account" value="Selected" showChevron={false} />}</GroupedSection>
    {defaults.error && <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{defaults.error.message}</Text>}
    {canWrite && detail.isActive && <ModernButton variant="secondary" loading={defaultAccount.isPending} onPress={() => defaultAccount.mutate()}>{defaults.data?.bankAccountId === bankAccountId ? 'Clear default payment account' : 'Use as default payment account'}</ModernButton>}
    {defaultAccount.error && <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{defaultAccount.error.message}</Text>}
    <GroupedSection title="Posted account movements"><View style={styles.fields}><ModernInput label="Movement period from" value={from} onChangeText={setFrom} /><ModernInput label="Movement period to" value={to} onChangeText={setTo} /><ModernButton variant="secondary" onPress={() => setPeriod({ from, to })}>Load movements</ModernButton></View>
      {movements.isLoading ? <ActivityIndicator color={theme.colors.accent} /> : movements.error ? <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{movements.error.message}</Text> : movements.data && <>{([['Period opening', 'openingBalance'], ['Money in', 'inflows'], ['Money out', 'outflows'], ['Net movement', 'movement'], ['Period closing', 'closingBalance']] as const).map(([label, field]) => <ListRow key={field} label={label} value={formatMoney(movements.data[field], movements.data.currency)} showChevron={false} />)}</>}
    </GroupedSection>
    {canWrite && <><ModernButton onPress={() => navigation.navigate('BankTransactionCreate', { bankAccountId })}>Add transaction</ModernButton><ModernButton variant="secondary" onPress={() => navigation.navigate('BankTransferCreate', { sourceAccountId: bankAccountId })}>Transfer</ModernButton><ModernButton variant="secondary" onPress={() => navigation.navigate('BankStatementImport', { bankAccountId })}>Import statement</ModernButton></>}
    <Text style={theme.type.headline}>Transactions</Text>
    {transactions.isLoading ? <ActivityIndicator color={theme.colors.accent} accessibilityLabel="Loading transactions" /> : transactions.error ? <EmptyState title="Transactions couldn’t be loaded" description={transactions.error.message} actionLabel="Try again" onAction={transactions.refetch} /> : !transactions.data?.transactions.length ? <EmptyState title="No transactions" description="Add one manually, transfer money, or import a CSV statement." /> : <GroupedSection>{transactions.data.transactions.map(t => <ListRow key={t.id} label={t.counterparty || t.description} subtitle={`${t.transactionDate} · ${t.source}${t.isReconciled ? ' · Reconciled' : ''}`} value={`${t.type === 'debit' ? '−' : '+'}${formatMoney(t.amount.replace(/^-/, ''), detail.currency)}`} showChevron={canWrite && t.source === 'manual' && !t.isReconciled} onPress={canWrite && t.source === 'manual' && !t.isReconciled ? () => navigation.navigate('BankTransactionEdit', { bankAccountId, transactionId: t.id }) : undefined} />)}</GroupedSection>}
    {pagination && pagination.totalPages > 1 && <View style={styles.pager}><ModernButton size="sm" variant="secondary" disabled={page <= 1} onPress={() => setPage(p => p - 1)}>Previous</ModernButton><Text style={theme.type.footnote}>Page {pagination.page} of {pagination.totalPages}</Text><ModernButton size="sm" variant="secondary" disabled={page >= pagination.totalPages} onPress={() => setPage(p => p + 1)}>Next</ModernButton></View>}
    <StatementWorkspacePanel bankAccountId={bankAccountId} canWrite={canWrite} />
    {remove.error && <Text style={{ color: theme.colors.danger }}>{remove.error.message}</Text>}
    {canWrite && <ModernButton variant="secondary" loading={remove.isPending} onPress={() => Alert.alert('Delete bank account?', 'Linked accounts cannot be deleted. This cannot be undone.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => remove.mutate() }])}>Delete bank account</ModernButton>}
  </ScrollView>;
}
const styles = StyleSheet.create({ center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, content: { padding: space.screen, paddingBottom: space.section, gap: space.lg }, hero: { alignItems: 'center', gap: space.sm }, fields: { padding: space.md, gap: space.sm }, pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' } });
