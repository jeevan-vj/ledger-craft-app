import React, { useLayoutEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { BillPaymentSheet } from '@/components/purchases/BillPaymentSheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { GroupedSection } from '@/components/ui/GroupedSection';
import { ListRow } from '@/components/ui/ListRow';
import { ModernButton } from '@/components/ui/ModernButton';
import { NativeHeaderButton } from '@/components/ui/NativeHeaderButton';
import { purchasesApi, type RecordBillPaymentRequest } from '@/features/purchases/api/purchasesApi';
import { objectsApi } from '@/features/storage/api/objectsApi';
import type { PurchaseStackParamList } from '@/navigation/types';
import { space } from '@/theme/tokens';
import { formatMoney } from '@/utils/money';
import { errorHaptic, successHaptic } from '@/utils/haptics';
import { useTheme } from '@/theme';

type Navigation = NativeStackNavigationProp<PurchaseStackParamList, 'BillDetail'>;
type Route = RouteProp<PurchaseStackParamList, 'BillDetail'>;

export default function BillDetailScreen() {
  const theme = useTheme();
  const { colors: palette } = theme;
  const styles = createStyles(theme);
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
  const cancelBill = useMutation({
    mutationFn: () => purchasesApi.cancelBill(params.billId),
    onSuccess: async () => { await refresh(); successHaptic(); },
    onError: errorHaptic,
  });
  const restoreBill = useMutation({ mutationFn: () => purchasesApi.restoreBill(params.billId), onSuccess: async () => { await refresh(); successHaptic(); }, onError: errorHaptic });
  const attach = useMutation({
    mutationFn: async () => {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== 'granted') throw new Error('Photo library permission is required to attach a receipt.');
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.75, base64: true });
      const asset = result.canceled ? undefined : result.assets[0];
      if (!asset) return;
      if (!asset.base64) throw new Error('The selected receipt could not be read.');
      const size = asset.fileSize ?? Math.ceil(asset.base64.length * 0.75);
      if (size > 1_048_576) throw new Error('Attachments must be 1 MB or smaller.');
      const filename = asset.fileName ?? `bill-receipt-${Date.now()}.jpg`;
      const contentType = asset.mimeType ?? 'image/jpeg';
      const uploaded = await objectsApi.upload({ kind: 'receipt', filename, contentType, contentBase64: asset.base64 });
      await purchasesApi.attachObject(params.billId, { objectKey: uploaded.key, filename, contentType, size: uploaded.size });
    },
    onSuccess: async () => { await refresh(); successHaptic(); },
    onError: errorHaptic,
  });
  const removeAttachment = useMutation({
    mutationFn: (attachmentId: string) => purchasesApi.removeAttachment(params.billId, attachmentId),
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

  if (bill.data === undefined && bill.isLoading) return <View style={styles.center}><ActivityIndicator size="large" color={palette.accent} /></View>;
  if (!bill.data) return <View style={styles.center}><EmptyState title="Couldn’t load this bill" description={bill.error instanceof Error ? bill.error.message : 'Try again.'} actionLabel="Try again" onAction={() => bill.refetch()} /></View>;
  const item = bill.data;
  const mutationError = receive.error ?? cancelBill.error ?? restoreBill.error ?? attach.error ?? removeAttachment.error;

  const confirmVoid = () => Alert.alert('Cancel bill?', 'This reverses the accounts payable journal. You can restore it later.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Cancel bill', style: 'destructive', onPress: () => cancelBill.mutate() },
  ]);

  return (
    <ScrollView style={styles.container} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.vendor}>{item.vendorName}</Text>
        <Text style={styles.total} selectable>{formatMoney(item.total, item.currency)}</Text>
        <Text style={styles.meta}>{item.displayStatus.toUpperCase()} · {formatMoney(item.balanceDue, item.currency)} due</Text>
      </View>
      <GroupedSection title="Bill details">
        <ListRow label="Bill number" value={item.billNumber} showChevron={false} />
        <ListRow label="Vendor reference" value={item.vendorReference ?? '—'} showChevron={false} />
        <ListRow label="Bill date" value={formatDate(item.issueDate)} showChevron={false} />
        <ListRow label="Due date" value={formatDate(item.dueDate)} showChevron={false} />
      </GroupedSection>
      <GroupedSection title="Line items">
        {item.lines.map((line) => <ListRow key={line.id} label={line.description} subtitle={line.accountName ?? 'No account selected'} value={formatMoney(line.total, item.currency)} showChevron={false} />)}
      </GroupedSection>
      <GroupedSection title="Totals">
        <ListRow label="Subtotal" value={formatMoney(item.subtotal, item.currency)} showChevron={false} />
        <ListRow label="GST" value={formatMoney(item.taxAmount, item.currency)} showChevron={false} />
        <ListRow label="Paid" value={formatMoney(item.totalPaid, item.currency)} showChevron={false} />
        <ListRow label="Balance due" value={formatMoney(item.balanceDue, item.currency)} showChevron={false} />
      </GroupedSection>
      <GroupedSection title="Attachments">
        {item.attachments.map((attachment) => <ListRow key={attachment.id} label={attachment.filename} subtitle={`${Math.ceil(attachment.size / 1024)} KB · tap to remove`} onPress={() => Alert.alert('Remove attachment?', attachment.filename, [{ text: 'Keep', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => removeAttachment.mutate(attachment.id) }])} />)}
        <ListRow label={attach.isPending ? 'Adding receipt…' : 'Add receipt photo'} accessibilityHint="Opens your photo library" onPress={() => attach.mutate()} disabled={attach.isPending} />
      </GroupedSection>
      <GroupedSection title="History">{item.history.map((entry) => <ListRow key={entry.id} label={entry.summary} subtitle={new Date(entry.createdAt).toLocaleString('en-NZ')} showChevron={false} />)}</GroupedSection>
      {mutationError instanceof Error ? <Text style={styles.error} selectable>{mutationError.message}</Text> : null}
      <View style={styles.actions}>
        {item.lifecycleStatus === 'draft' ? <ModernButton fullWidth loading={receive.isPending} onPress={() => receive.mutate()}>Receive and post</ModernButton> : null}
        {item.lifecycleStatus === 'received' && item.paymentStatus !== 'paid' ? <ModernButton fullWidth onPress={() => setPaymentOpen(true)}>Record payment</ModernButton> : null}
        {item.lifecycleStatus === 'received' && item.paymentStatus === 'unpaid' ? <ModernButton fullWidth variant="ghost" loading={cancelBill.isPending} onPress={confirmVoid}>Cancel bill</ModernButton> : null}
        {item.lifecycleStatus === 'void' ? <ModernButton fullWidth loading={restoreBill.isPending} onPress={() => restoreBill.mutate()}>Restore bill</ModernButton> : null}
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

const createStyles = ({ colors: palette, type }: ReturnType<typeof useTheme>) => StyleSheet.create({
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
