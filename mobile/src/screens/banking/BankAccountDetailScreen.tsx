import React, { useCallback, useLayoutEffect } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EmptyState, GroupedSection, ListRow, ModernButton } from '@/components/ui';
import { NativeHeaderButton } from '@/components/ui/NativeHeaderButton';
import { bankingApi } from '@/features/banking/api/bankingApi';
import type { MoreStackParamList } from '@/navigation/types';
import { useTheme } from '@/theme';
import { space } from '@/theme/tokens';
import { formatMoney } from '@/utils/money';

type Navigation = NativeStackNavigationProp<MoreStackParamList, 'BankAccountDetail'>;
type Route = RouteProp<MoreStackParamList, 'BankAccountDetail'>;
const typeLabel = { business: 'Business', checking: 'Checking', savings: 'Savings', credit_card: 'Credit card' } as const;

export default function BankAccountDetailScreen() {
  const theme = useTheme(); const navigation = useNavigation<Navigation>(); const queryClient = useQueryClient(); const { bankAccountId } = useRoute<Route>().params;
  const account = useQuery({ queryKey: ['banking', 'account', bankAccountId], queryFn: () => bankingApi.getAccount(bankAccountId) });
  const transactions = useQuery({ queryKey: ['banking', 'transactions', bankAccountId], queryFn: () => bankingApi.listTransactions(bankAccountId) });
  const accountFetched = account.isFetched; const refetchAccount = account.refetch;
  const transactionsFetched = transactions.isFetched; const refetchTransactions = transactions.refetch;
  useFocusEffect(useCallback(() => { if (accountFetched) void refetchAccount(); if (transactionsFetched) void refetchTransactions(); }, [accountFetched, refetchAccount, refetchTransactions, transactionsFetched]));
  useLayoutEffect(() => navigation.setOptions({ title: account.data?.accountName || 'Bank account', headerRight: account.data ? () => <NativeHeaderButton label="Edit" primary onPress={() => navigation.navigate('BankAccountEdit', { bankAccountId })} /> : undefined }), [account.data, bankAccountId, navigation]);
  const remove = useMutation({ mutationFn: () => bankingApi.removeAccount(bankAccountId), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['banking'] }); navigation.goBack(); } });
  const confirmDelete = () => Alert.alert('Delete bank account?', 'Accounts with linked transactions or payments may be rejected by the server. This cannot be undone.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => remove.mutate() }]);

  if (account.isLoading) return <View style={[styles.center, { backgroundColor: theme.colors.background }]}><ActivityIndicator color={theme.colors.accent} accessibilityLabel="Loading bank account details" /></View>;
  if (!account.data) return <View style={[styles.center, { backgroundColor: theme.colors.background }]}><EmptyState title="Bank account not found" description={account.error?.message || 'This account may no longer exist.'} actionLabel="Try again" onAction={account.refetch} /></View>;
  const detail = account.data;
  return <ScrollView style={{ backgroundColor: theme.colors.background }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
    <View style={styles.hero}><View style={[styles.icon, { backgroundColor: theme.colors.accentFill }]}><Feather name="briefcase" size={30} color={theme.colors.accentText} /></View><Text style={[theme.type.money, styles.centerText]}>{formatMoney(detail.currentBalance, detail.currency)}</Text><Text style={[theme.type.caption, { color: detail.isActive ? theme.colors.accentText : theme.colors.textTertiary }]}>{detail.isActive ? 'ACTIVE' : 'INACTIVE'} · {typeLabel[detail.accountType].toUpperCase()}</Text></View>
    <GroupedSection title="Account"><ListRow label="Bank" value={detail.bankName} showChevron={false} /><ListRow label="Account number" value={detail.accountNumber} showChevron={false} /><ListRow label="Currency" value={detail.currency} showChevron={false} /><ListRow label="Opening balance" value={formatMoney(detail.openingBalance, detail.currency)} showChevron={false} /></GroupedSection>
    <View style={styles.actions}><ModernButton size="md" onPress={() => navigation.navigate('BankTransactionCreate', { bankAccountId })}>Add transaction</ModernButton><ModernButton size="md" variant="secondary" onPress={() => navigation.navigate('BankTransferCreate', { sourceAccountId: bankAccountId })}>Transfer</ModernButton></View>
    <ModernButton fullWidth variant="secondary" icon={<Feather name="upload" size={17} color={theme.colors.text} />} onPress={() => navigation.navigate('BankStatementImport', { bankAccountId })}>Import statement</ModernButton>
    <Text style={[theme.type.headline, styles.heading]}>Transactions</Text>
    {transactions.isLoading ? <ActivityIndicator color={theme.colors.accent} accessibilityLabel="Loading transactions" /> : transactions.error ? <EmptyState title="Transactions couldn’t be loaded" description={transactions.error.message} actionLabel="Try again" onAction={transactions.refetch} /> : !transactions.data?.length ? <EmptyState title="No transactions" description="Add one manually, transfer money, or import a CSV statement." /> : <View style={[styles.transactionGroup, { backgroundColor: theme.colors.surface }]}>{transactions.data.map((transaction, index) => <View key={transaction.id} style={index ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.separator } : undefined}><ListRow label={transaction.counterparty || transaction.merchant || transaction.description} subtitle={`${transaction.transactionDate} · ${transaction.source === 'transfer' ? 'Transfer' : transaction.source === 'manual' ? 'Manual' : 'Imported'}${transaction.isReconciled ? ' · Reconciled' : ''}`} value={`${transaction.type === 'debit' ? '−' : '+'}${formatMoney(transaction.amount.replace(/^-/, ''), detail.currency)}`} showChevron={transaction.source === 'manual' && !transaction.isReconciled} onPress={transaction.source === 'manual' && !transaction.isReconciled ? () => navigation.navigate('BankTransactionEdit', { bankAccountId, transactionId: transaction.id }) : undefined} accessibilityHint={transaction.source === 'manual' && !transaction.isReconciled ? 'Edits this manual transaction' : undefined} icon={<Feather name={transaction.type === 'debit' ? 'arrow-up-right' : 'arrow-down-left'} size={17} color={transaction.type === 'debit' ? theme.colors.danger : theme.colors.success} />} /></View>)}</View>}
    {remove.error ? <Text style={[theme.type.footnote, styles.deleteError, { color: theme.colors.danger }]}>{remove.error.message}</Text> : null}
    <Pressable onPress={confirmDelete} disabled={remove.isPending} accessibilityRole="button" accessibilityLabel="Delete bank account" accessibilityState={{ disabled: remove.isPending, busy: remove.isPending }} style={styles.delete}><Text style={[theme.type.callout, { color: theme.colors.danger }]}>{remove.isPending ? 'Deleting…' : 'Delete bank account'}</Text></Pressable>
  </ScrollView>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, content: { padding: space.screen, paddingBottom: 48 }, hero: { alignItems: 'center', marginBottom: space.xxl },
  icon: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginBottom: space.md }, centerText: { textAlign: 'center', marginBottom: space.xs },
  heading: { marginTop: space.section, marginBottom: space.md }, transactionGroup: { borderRadius: 20, overflow: 'hidden' }, delete: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: space.xxl }, deleteError: { textAlign: 'center', marginTop: space.lg },
  actions: { flexDirection: 'row', gap: space.sm, marginBottom: space.lg },
});
