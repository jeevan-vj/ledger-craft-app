import React, { useLayoutEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BillPaymentSheet } from '@/components/purchases/BillPaymentSheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { GroupedSection } from '@/components/ui/GroupedSection';
import { ListRow } from '@/components/ui/ListRow';
import { ModernButton } from '@/components/ui/ModernButton';
import { NativeHeaderButton } from '@/components/ui/NativeHeaderButton';
import { purchasesApi, type RecordBillPaymentRequest } from '@/features/purchases/api/purchasesApi';
import type { PurchaseStackParamList } from '@/navigation/types';
import { palette, space, type } from '@/theme/tokens';
import { formatMoney } from '@/utils/money';
import { errorHaptic, successHaptic } from '@/utils/haptics';

type Navigation = NativeStackNavigationProp<PurchaseStackParamList, 'BillDetail'>;
type Route = RouteProp<PurchaseStackParamList, 'BillDetail'>;

export default function BillDetailScreen() {
  const navigation = useNavigation<Navigation>();
  const { params } = useRoute<Route>();
  const queryClient = useQueryClient();
  const [paymentOpen, setPaymentOpen] = useState(false);
  const bill = useQuery({ queryKey: ['purchases', 'bill', params.billId], queryFn: () => purchasesApi.getBill(params.billId) });
  const banks = useQuery({ queryKey: ['purchases', 'bank-accounts'], queryFn: purchasesApi.listBankAccounts });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['purchases', 'bills'] }),
      queryClient.invalidateQueries({ queryKey: ['purchases', 'bill', params.billId] }),
    ]);
  };
  const receive = useMutation({
    mutationFn: () => purchasesApi.receiveBill(params.billId),
    onSuccess: async () => { await refresh(); successHaptic(); },
    onError: errorHaptic,
  });
  const voidBill = useMutation({
    mutationFn: () => purchasesApi.voidBill(params.billId),
    onSuccess: async () => { await refresh(); successHaptic(); },
    onError: errorHaptic,
  });
  const payment = useMutation({
    mutationFn: (input: RecordBillPaymentRequest) => purchasesApi.recordPayment(params.billId, input),
    onSuccess: async () => { await refresh(); successHaptic(); setPaymentOpen(false); },
    onError: errorHaptic,
  });

  useLayoutEffect(() => {
    navigation.setOptions({
      title: bill.data?.billNumber ?? 'Bill',
      headerRight: () => bill.data?.lifecycleStatus === 'draft' ? (
        <NativeHeaderButton label="Edit" onPress={() => navigation.navigate('BillEdit', { billId: params.billId })} />
      ) : null,
    });
  }, [bill.data?.billNumber, bill.data?.lifecycleStatus, navigation, params.billId]);

  if (bill.data === undefined && bill.isLoading) return <View style={styles.center}><ActivityIndicator size="large" color={palette.accentForeground} /></View>;
  if (!bill.data) return <View style={styles.center}><EmptyState title="Couldn’t load this bill" description={bill.error instanceof Error ? bill.error.message : 'Try again.'} actionLabel="Try again" onAction={() => bill.refetch()} /></View>;
  const item = bill.data;
  const mutationError = receive.error ?? voidBill.error;

  const confirmVoid = () => Alert.alert('Void bill?', 'This reverses the accounts payable journal and cannot be treated as unpaid again.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Void bill', style: 'destructive', onPress: () => voidBill.mutate() },
  ]);

  return (
    <ScrollView style={styles.container} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.vendor}>{item.vendorName}</Text>
        <Text style={styles.total} selectable>{formatMoney(Number(item.total), item.currency)}</Text>
        <Text style={styles.meta}>{item.displayStatus.toUpperCase()} · {formatMoney(Number(item.balanceDue), item.currency)} due</Text>
      </View>
      <GroupedSection title="Bill details">
        <ListRow label="Bill number" value={item.billNumber} showChevron={false} />
        <ListRow label="Vendor reference" value={item.vendorReference ?? '—'} showChevron={false} />
        <ListRow label="Bill date" value={formatDate(item.issueDate)} showChevron={false} />
        <ListRow label="Due date" value={formatDate(item.dueDate)} showChevron={false} />
      </GroupedSection>
      <GroupedSection title="Line items">
        {item.lines.map((line) => <ListRow key={line.id} label={line.description} subtitle={line.accountName ?? 'No account selected'} value={formatMoney(Number(line.total), item.currency)} showChevron={false} />)}
      </GroupedSection>
      <GroupedSection title="Totals">
        <ListRow label="Subtotal" value={formatMoney(Number(item.subtotal), item.currency)} showChevron={false} />
        <ListRow label="GST" value={formatMoney(Number(item.taxAmount), item.currency)} showChevron={false} />
        <ListRow label="Paid" value={formatMoney(Number(item.totalPaid), item.currency)} showChevron={false} />
        <ListRow label="Balance due" value={formatMoney(Number(item.balanceDue), item.currency)} showChevron={false} />
      </GroupedSection>
      {mutationError instanceof Error ? <Text style={styles.error} selectable>{mutationError.message}</Text> : null}
      <View style={styles.actions}>
        {item.lifecycleStatus === 'draft' ? <ModernButton fullWidth loading={receive.isPending} onPress={() => receive.mutate()}>Receive and post</ModernButton> : null}
        {item.lifecycleStatus === 'received' && item.paymentStatus !== 'paid' ? <ModernButton fullWidth onPress={() => setPaymentOpen(true)}>Record payment</ModernButton> : null}
        {item.lifecycleStatus === 'received' && item.paymentStatus === 'unpaid' ? <ModernButton fullWidth variant="ghost" loading={voidBill.isPending} onPress={confirmVoid}>Void bill</ModernButton> : null}
      </View>
      <BillPaymentSheet
        bill={item}
        bankAccounts={(banks.data ?? []).filter((bank) => bank.isActive)}
        visible={paymentOpen}
        saving={payment.isPending}
        error={payment.error instanceof Error ? payment.error.message : null}
        onClose={() => { if (!payment.isPending) { setPaymentOpen(false); payment.reset(); } }}
        onSubmit={(input) => payment.mutate(input)}
      />
    </ScrollView>
  );
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-NZ', { dateStyle: 'medium' });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
  content: { paddingHorizontal: space.screen, paddingTop: space.lg, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.background },
  hero: { alignItems: 'center', paddingVertical: space.xxl },
  vendor: { ...type.headline },
  total: { ...type.money, marginTop: space.sm, fontVariant: ['tabular-nums'] },
  meta: { ...type.caption, marginTop: space.sm },
  error: { ...type.footnote, color: palette.danger, marginBottom: space.lg },
  actions: { gap: space.md },
});
