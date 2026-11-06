import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StatementSummaryPanel } from '@/components/banking/StatementSummaryPanel';
import { ExistingSettlementPanel } from '@/components/banking/ExistingSettlementPanel';
import { AppPressable, EmptyState, GroupedSection, ListRow, ModernButton, ModernInput } from '@/components/ui';
import { bankingApi, type AcceptReconciliationRequest, type ReconciliationAllocation, type ReconciliationSplit } from '@/features/banking/api/bankingApi';
import { bankFeeEligible, calculateAmountLeft, cents, suggestedAllocationAmount } from '@/features/banking/model/reconciliationMath';
import type { MoreStackParamList } from '@/navigation/types';
import { useTheme } from '@/theme';
import { radius, space } from '@/theme/tokens';

type Navigation = NativeStackNavigationProp<MoreStackParamList, 'BankReconciliationMatch'>;
type Route = RouteProp<MoreStackParamList, 'BankReconciliationMatch'>;

export default function BankReconciliationMatchScreen() {
  const theme = useTheme(); const navigation = useNavigation<Navigation>(); const { transactionId } = useRoute<Route>().params; const queryClient = useQueryClient();
  const transaction = useQuery({ queryKey: ['banking', 'transaction', transactionId], queryFn: () => bankingApi.getTransaction(transactionId) });
  const suggestions = useQuery({ queryKey: ['banking', 'suggestions', transactionId], queryFn: () => bankingApi.suggestions(transactionId), enabled: Boolean(transaction.data && !transaction.data.isReconciled) });
  const [documents, ledgerAccounts] = useQueries({ queries: [
    { queryKey: ['banking', 'reconciliation-documents', transaction.data?.type], queryFn: () => bankingApi.listReconciliationDocuments(transaction.data?.type === 'debit' ? 'bill' : 'invoice'), enabled: Boolean(transaction.data && !transaction.data.isReconciled) },
    { queryKey: ['banking', 'ledger-accounts'], queryFn: bankingApi.listLedgerAccounts, enabled: Boolean(transaction.data && !transaction.data.isReconciled) },
  ] });
  const [allocations, setAllocations] = useState<ReconciliationAllocation[]>([]); const [splits, setSplits] = useState<ReconciliationSplit[]>([]); const [bankFee, setBankFee] = useState(''); const [splitAccountId, setSplitAccountId] = useState('');
  const bankAmount = transaction.data?.amount ?? '0';
  const amountState = useMemo(() => calculateAmountLeft(bankAmount, allocations, splits, bankFee), [allocations, bankAmount, bankFee, splits]);
  const refresh = async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ['banking', 'reconciliation'] }), queryClient.invalidateQueries({ queryKey: ['banking', 'transaction', transactionId] }), queryClient.invalidateQueries({ queryKey: ['banking', 'suggestions', transactionId] })]); };
  const accept = useMutation({ mutationFn: (input: AcceptReconciliationRequest) => bankingApi.acceptSuggestion(transactionId, input), onSuccess: async () => { await refresh(); navigation.goBack(); } });
  const personal = useMutation({ mutationFn: () => bankingApi.markPersonal(transactionId), onSuccess: async () => { await refresh(); navigation.goBack(); } });
  const undo = useMutation({ mutationFn: () => bankingApi.undoReconciliation(transactionId, { reason: 'Reopened from mobile bank reconciliation', reversalDate: new Date().toISOString().slice(0, 10) }), onSuccess: refresh });
  const addDocument = (documentId: string) => {
    const document = documents.data?.find((item) => item.id === documentId); if (!document || allocations.some((item) => item.documentId === documentId)) return;
    setAllocations((rows) => [...rows, { documentType: document.documentType, documentId, amount: suggestedAllocationAmount(bankAmount, document.balanceDue, amountState.allocated) }]);
  };
  const acceptSuggestion = (suggestion: NonNullable<typeof suggestions.data>['suggestions'][number]) => {
    if ((suggestion.type === 'invoice' || suggestion.type === 'bill') && suggestion.amount && cents(suggestion.amount) === cents(bankAmount)) accept.mutate({ allocations: [{ documentType: suggestion.type, documentId: suggestion.id, amount: bankAmount }], splits: [] });
    else if (suggestion.type === 'matching_rule' && suggestion.targetAccountId) accept.mutate({ allocations: [], splits: [{ accountId: suggestion.targetAccountId, amount: bankAmount }] });
    else if (suggestion.type === 'invoice' || suggestion.type === 'bill') {
      setSplits([]); setBankFee('');
      setAllocations([{ documentType: suggestion.type, documentId: suggestion.id, amount: suggestedAllocationAmount(bankAmount, suggestion.amount ?? bankAmount) }]);
    } else Alert.alert('Review needed', 'Add this match manually before saving.');
  };
  const addSplit = () => { if (!splitAccountId || cents(amountState.amountLeft) <= 0n) return; setSplits((rows) => [...rows, { accountId: splitAccountId, amount: amountState.amountLeft }]); setSplitAccountId(''); };
  const error = accept.error ?? personal.error ?? undo.error;

  if (transaction.isLoading) return <View style={[styles.center, { backgroundColor: theme.colors.background }]}><ActivityIndicator color={theme.colors.accentText} /></View>;
  if (!transaction.data || transaction.error) return <View style={[styles.center, { backgroundColor: theme.colors.background }]}><EmptyState icon="alert-circle" title="Transaction unavailable" description={transaction.error?.message ?? 'The bank transaction could not be found.'} actionLabel="Try again" onAction={() => transaction.refetch()} /></View>;
  const item = transaction.data;
  if (item.isReconciled) return <ScrollView style={{ backgroundColor: theme.colors.background }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}><GroupedSection title="Reconciled transaction"><ListRow label={item.description} subtitle={`${item.transactionDate} · ${item.reference ?? 'No reference'}`} value={`$${item.amount}`} showChevron={false} />{item.documentConnections.map((connection) => <ListRow key={connection.id} label={`${connection.documentType === 'invoice' ? 'Invoice' : 'Bill'} ${connection.documentNumber}`} value={`$${connection.amount}`} showChevron={false} />)}</GroupedSection><StatementSummaryPanel bankAccountId={item.bankAccountId} /><Text style={theme.type.subhead}>Undo is available only for transactions reconciled through this matching flow. The server verifies that before reversing its journal and payments.</Text>{undo.error ? <Text style={[theme.type.footnote, { color: theme.colors.danger }]}>{undo.error.message}</Text> : null}<ModernButton variant="outline" fullWidth onPress={() => Alert.alert('Undo reconciliation?', 'This creates audited reversals for the reconciliation.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Undo', style: 'destructive', onPress: () => undo.mutate() }])} loading={undo.isPending}>Undo reconciliation</ModernButton></ScrollView>;

  return <ScrollView style={{ backgroundColor: theme.colors.background }} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <GroupedSection title="Bank transaction"><ListRow label={item.description} subtitle={`${item.transactionDate} · ${item.type === 'credit' ? 'Money in' : 'Money out'}`} value={`$${item.amount}`} showChevron={false} /></GroupedSection>
    <ExistingSettlementPanel transaction={item} onMatched={() => void refresh()} />
    <GroupedSection title="Ranked suggestions" footer="Server-ranked suggestions only. Matching rules suggest; they never auto-post.">
      {suggestions.isLoading ? <ActivityIndicator style={styles.loading} color={theme.colors.accentText} /> : suggestions.data?.suggestions.length ? suggestions.data.suggestions.map((suggestion) => { const oneTap = suggestion.type === 'matching_rule' || Boolean(suggestion.amount && cents(suggestion.amount) === cents(bankAmount)); return <View key={`${suggestion.type}-${suggestion.id}`} style={styles.suggestion}><View style={styles.suggestionCopy}><Text style={theme.type.callout}>{suggestion.description}</Text><Text style={theme.type.footnote}>{suggestion.score}% · {suggestion.reasons.join(' · ')}</Text></View><ModernButton size="sm" variant={oneTap ? 'primary' : 'outline'} onPress={() => acceptSuggestion(suggestion)} loading={accept.isPending}>{oneTap ? 'Accept' : 'Use'}</ModernButton></View>; }) : <Text style={[theme.type.subhead, styles.emptyCopy]}>No server suggestions. Choose open documents or a remainder account below.</Text>}
    </GroupedSection>
    <GroupedSection title={item.type === 'credit' ? 'Open invoices' : 'Open bills'} footer="Tap more than one document to create a combined match. Partial allocations leave the document part-paid.">
      {(documents.data ?? []).map((document) => {
        const allocation = allocations.find((row) => row.documentId === document.id);
        return <View key={document.id}><AppPressable accessibilityRole="button" onPress={() => addDocument(document.id)} style={styles.document}><View style={styles.suggestionCopy}><Text style={theme.type.callout}>{document.number} · {document.partyName}</Text><Text style={theme.type.footnote}>Due ${document.balanceDue} · {document.date}</Text></View><Feather name={allocation ? 'check-circle' : 'plus-circle'} size={22} color={allocation ? theme.colors.success : theme.colors.accentText} /></AppPressable>{allocation ? <View style={styles.allocation}><ModernInput label="Allocated amount" value={allocation.amount} keyboardType="decimal-pad" onChangeText={(amount) => setAllocations((rows) => rows.map((row) => row.documentId === document.id ? { ...row, amount } : row))} /><AppPressable accessibilityRole="button" accessibilityLabel={`Remove ${document.number}`} onPress={() => setAllocations((rows) => rows.filter((row) => row.documentId !== document.id))} style={styles.remove}><Feather name="trash-2" size={18} color={theme.colors.danger} /></AppPressable></View> : null}</View>;
      })}
      {!documents.isLoading && !documents.data?.length ? <Text style={[theme.type.subhead, styles.emptyCopy]}>No eligible open documents.</Text> : null}
    </GroupedSection>
    <GroupedSection title="Remainder" footer="Allocate the amount left to a ledger account, or use a small money-out difference as a bank fee.">
      <View style={styles.accountGrid}>{(ledgerAccounts.data ?? []).map((account) => <AppPressable key={account.id} accessibilityRole="radio" accessibilityState={{ selected: splitAccountId === account.id }} onPress={() => setSplitAccountId(account.id)} style={[styles.account, { backgroundColor: splitAccountId === account.id ? theme.colors.accentFill : theme.colors.fillMuted }]}><Text style={theme.type.callout}>{account.name}</Text></AppPressable>)}</View>
      <View style={styles.actionRow}><ModernButton variant="outline" size="sm" disabled={!splitAccountId || cents(amountState.amountLeft) <= 0n} onPress={addSplit}>Split ${amountState.amountLeft}</ModernButton>{bankFeeEligible(item.type, bankAmount, amountState.amountLeft) ? <ModernButton variant="outline" size="sm" onPress={() => setBankFee(amountState.amountLeft)}>Use as bank fee</ModernButton> : null}</View>
      {splits.map((split, index) => <ListRow key={`${split.accountId}-${index}`} label={ledgerAccounts.data?.find((account) => account.id === split.accountId)?.name ?? 'Ledger account'} value={`$${split.amount}`} showChevron={false} onPress={() => setSplits((rows) => rows.filter((_, rowIndex) => rowIndex !== index))} />)}
      {bankFee ? <ListRow label="Bank fee adjustment" value={`$${bankFee}`} showChevron={false} onPress={() => setBankFee('')} /> : null}
    </GroupedSection>
    <GroupedSection title="Other actions"><ListRow label="Mark as personal" subtitle="Reconcile without a business allocation" icon={<Feather name="user" size={18} color={theme.colors.accentText} />} onPress={() => Alert.alert('Mark as personal?', 'This records an audited personal reconciliation.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Mark personal', onPress: () => personal.mutate() }])} /><ListRow label="Transfer" subtitle="Use the existing bank transfer flow" icon={<Feather name="repeat" size={18} color={theme.colors.accentText} />} onPress={() => navigation.navigate('BankTransferCreate', { sourceAccountId: item.bankAccountId })} /></GroupedSection>
    <View style={[styles.total, { backgroundColor: amountState.overflow ? theme.colors.dangerFill : amountState.complete ? theme.colors.successFill : theme.colors.fillMuted }]}><View><Text style={theme.type.caption}>AMOUNT LEFT</Text><Text style={theme.type.footnote}>${amountState.allocated} allocated</Text></View><Text accessibilityLabel={`Amount left ${amountState.amountLeft}`} style={[theme.type.title, { color: amountState.overflow ? theme.colors.danger : theme.colors.text, fontVariant: ['tabular-nums'] }]}>${amountState.amountLeft}</Text></View>
    {amountState.overflow ? <Text accessibilityLiveRegion="polite" style={[theme.type.footnote, { color: theme.colors.danger }]}>Allocations exceed the bank amount. Reduce an allocation before saving.</Text> : null}
    {error ? <Text accessibilityLiveRegion="polite" style={[theme.type.footnote, { color: theme.colors.danger }]}>{error.message}</Text> : null}
    <ModernButton fullWidth size="lg" disabled={!amountState.complete || amountState.overflow} loading={accept.isPending} onPress={() => accept.mutate({ allocations, splits, bankFee: bankFee || undefined, paymentDate: item.transactionDate, reference: item.reference })}>Save reconciliation</ModernButton>
  </ScrollView>;
}

const styles = StyleSheet.create({ center: { flex: 1, justifyContent: 'center', padding: space.screen }, content: { padding: space.screen, paddingBottom: 64, gap: space.lg }, loading: { padding: space.xl }, suggestion: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg }, suggestionCopy: { flex: 1 }, emptyCopy: { padding: space.lg }, document: { minHeight: 64, flexDirection: 'row', alignItems: 'center', padding: space.lg, gap: space.md }, allocation: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg }, remove: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, accountGrid: { padding: space.lg, gap: space.sm }, account: { minHeight: 48, borderRadius: radius.md, justifyContent: 'center', paddingHorizontal: space.md }, actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.lg }, total: { minHeight: 84, borderRadius: radius.group, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: space.lg } });
