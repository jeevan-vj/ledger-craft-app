import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FormSwitch } from '@/components/ui/FormSwitch';
import { EmptyState } from '@/components/ui/EmptyState';
import { GroupedSection } from '@/components/ui/GroupedSection';
import { ListRow } from '@/components/ui/ListRow';
import { ModernButton } from '@/components/ui/ModernButton';
import { ModernInput } from '@/components/ui/ModernInput';
import { SelectionRow, SelectionSheet } from '@/components/ui/SelectionSheet';
import { SmartDatePicker } from '@/components/ui/SmartDatePicker';
import { purchasesApi, type BillLineInput, type BillWriteRequest } from '@/features/purchases/api/purchasesApi';
import { isBillDateRangeValid, moveDueDateForward } from '@/features/purchases/model/purchaseForms';
import type { PurchaseStackParamList } from '@/navigation/types';
import { control, palette, radius, space, type } from '@/theme/tokens';
import { formatMoney } from '@/utils/money';
import { errorHaptic, successHaptic } from '@/utils/haptics';

type Navigation = NativeStackNavigationProp<PurchaseStackParamList, 'BillCreate'>;
type Route = RouteProp<PurchaseStackParamList, 'BillCreate' | 'BillEdit'>;
const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (date: string, days: number) => {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
};
const emptyLine = (): BillLineInput => ({ description: '', quantity: '1', unitPrice: '', taxRate: '15', accountId: null });

export default function BillFormScreen() {
  const navigation = useNavigation<Navigation>();
  const route = useRoute<Route>();
  const billId = route.name === 'BillEdit'
    ? (route.params as PurchaseStackParamList['BillEdit']).billId
    : undefined;
  const queryClient = useQueryClient();
  const vendors = useQuery({ queryKey: ['purchases', 'vendors'], queryFn: purchasesApi.listVendors });
  const accounts = useQuery({ queryKey: ['purchases', 'accounts'], queryFn: purchasesApi.listAccounts });
  const existing = useQuery({ queryKey: ['purchases', 'bill', billId], queryFn: () => purchasesApi.getBill(billId!), enabled: Boolean(billId) });
  const [form, setForm] = useState<BillWriteRequest>({
    vendorId: '', vendorReference: null, issueDate: today(), dueDate: plusDays(today(), 20), currency: 'NZD', taxInclusive: true, notes: null, lines: [emptyLine()],
  });
  const [vendorPicker, setVendorPicker] = useState(false);
  const [accountLine, setAccountLine] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!existing.data) return;
    setForm({
      vendorId: existing.data.vendorId,
      vendorReference: existing.data.vendorReference,
      issueDate: existing.data.issueDate,
      dueDate: existing.data.dueDate,
      currency: existing.data.currency,
      taxInclusive: existing.data.taxInclusive,
      notes: existing.data.notes,
      lines: existing.data.lines.map(({ description, quantity, unitPrice, taxRate, accountId }) => ({ description, quantity, unitPrice, taxRate, accountId })),
    });
  }, [existing.data]);

  const save = useMutation({
    mutationFn: () => {
      if (billId && !existing.data) throw new Error('Load the existing bill before saving changes.');
      return billId ? purchasesApi.updateBill(billId, form) : purchasesApi.createBill(form);
    },
    onSuccess: async (bill) => {
      await queryClient.invalidateQueries({ queryKey: ['purchases', 'bills'] });
      queryClient.setQueryData(['purchases', 'bill', bill.id], bill);
      successHaptic();
      navigation.replace('BillDetail', { billId: bill.id });
    },
    onError: errorHaptic,
  });

  const selectedVendor = vendors.data?.find((vendor) => vendor.id === form.vendorId);
  const eligibleAccounts = (accounts.data ?? []).filter((account) => account.isActive && (account.type === 'expense' || ['expense', 'asset'].includes(account.accountClass ?? '')));
  const totals = useMemo(() => form.lines.reduce((sum, line) => {
    const base = (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0);
    const rate = Number(line.taxRate) || 0;
    const tax = form.taxInclusive ? (rate ? base * rate / (100 + rate) : 0) : base * rate / 100;
    return { subtotal: sum.subtotal + (form.taxInclusive ? base - tax : base), tax: sum.tax + tax, total: sum.total + (form.taxInclusive ? base : base + tax) };
  }, { subtotal: 0, tax: 0, total: 0 }), [form.lines, form.taxInclusive]);
  const valid = Boolean(form.vendorId && isBillDateRangeValid(form.issueDate, form.dueDate) && form.lines.length && form.lines.every((line) => line.description.trim() && Number(line.quantity) > 0 && Number(line.unitPrice) >= 0 && line.accountId));

  const updateLine = (index: number, patch: Partial<BillLineInput>) => setForm((current) => ({ ...current, lines: current.lines.map((line, i) => i === index ? { ...line, ...patch } : line) }));

  if (billId && existing.data === undefined && existing.isLoading) return <View style={styles.center}><ActivityIndicator size="large" color={palette.accentForeground} /></View>;
  if (billId && existing.data === undefined && existing.isError) {
    return (
      <View style={styles.center}>
        <EmptyState
          title="Couldn’t load this bill"
          description={existing.error instanceof Error ? existing.error.message : 'Try again.'}
          actionLabel="Try again"
          onAction={() => existing.refetch()}
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <GroupedSection title="Supplier">
          <ListRow label="Vendor" value={selectedVendor?.name} placeholder="Choose vendor" accessibilityHint="Opens the vendor picker" onPress={() => { setSearch(''); setVendorPicker(true); }} />
        </GroupedSection>
        <ModernInput label="Vendor reference (optional)" value={form.vendorReference ?? ''} onChangeText={(vendorReference) => setForm({ ...form, vendorReference: vendorReference || null })} />
        <SmartDatePicker label="Bill date" value={form.issueDate} showPresets={false} onChangeDate={(issueDate) => setForm({ ...form, issueDate, dueDate: moveDueDateForward(issueDate, form.dueDate) })} />
        <SmartDatePicker label="Due date" value={form.dueDate} minimumDate={new Date(`${form.issueDate}T12:00:00`)} presetBaseDate={form.issueDate} onChangeDate={(dueDate) => setForm({ ...form, dueDate })} />
        <FormSwitch label="Prices include GST" value={form.taxInclusive ?? true} onValueChange={(taxInclusive) => setForm({ ...form, taxInclusive })} description="The server calculates and posts authoritative totals." />

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Line items</Text>
          <Pressable onPress={() => setForm({ ...form, lines: [...form.lines, emptyLine()] })} accessibilityRole="button" style={styles.addButton}>
            <Feather name="plus" size={17} color={palette.accentForeground} /><Text style={styles.addLabel}>Add line</Text>
          </Pressable>
        </View>
        {form.lines.map((line, index) => {
          const account = accounts.data?.find((item) => item.id === line.accountId);
          return (
            <View key={index} style={styles.lineCard}>
              <View style={styles.lineHeading}>
                <Text style={styles.lineTitle}>Line {index + 1}</Text>
                {form.lines.length > 1 ? <Pressable onPress={() => setForm({ ...form, lines: form.lines.filter((_, i) => i !== index) })} style={styles.iconButton} accessibilityRole="button" accessibilityLabel={`Remove line ${index + 1}`} accessibilityHint="Removes this line item"><Feather name="trash-2" size={18} color={palette.danger} /></Pressable> : null}
              </View>
              <ModernInput label="Description" value={line.description} onChangeText={(description) => updateLine(index, { description })} placeholder="What was supplied" />
              <View style={styles.fieldRow}>
                <View style={styles.field}><ModernInput label="Quantity" value={line.quantity} onChangeText={(quantity) => updateLine(index, { quantity })} keyboardType="decimal-pad" /></View>
                <View style={styles.field}><ModernInput label="Unit price" value={line.unitPrice} onChangeText={(unitPrice) => updateLine(index, { unitPrice })} keyboardType="decimal-pad" /></View>
                <View style={styles.smallField}><ModernInput label="GST %" value={line.taxRate} onChangeText={(taxRate) => updateLine(index, { taxRate })} keyboardType="decimal-pad" /></View>
              </View>
              <GroupedSection><ListRow label="Account" value={account ? `${account.accountNumber ? `${account.accountNumber} · ` : ''}${account.name}` : undefined} placeholder="Choose expense or asset" accessibilityHint="Opens the account picker" onPress={() => { setSearch(''); setAccountLine(index); }} /></GroupedSection>
            </View>
          );
        })}

        <GroupedSection title="Draft totals">
          <ListRow label="Subtotal" value={formatMoney(totals.subtotal, form.currency)} showChevron={false} />
          <ListRow label="GST" value={formatMoney(totals.tax, form.currency)} showChevron={false} />
          <ListRow label="Total" value={formatMoney(totals.total, form.currency)} showChevron={false} />
        </GroupedSection>
        <ModernInput label="Notes (optional)" value={form.notes ?? ''} onChangeText={(notes) => setForm({ ...form, notes: notes || null })} multiline numberOfLines={4} />
        {save.error instanceof Error ? <Text style={styles.error} selectable>{save.error.message}</Text> : null}
        <ModernButton fullWidth loading={save.isPending} disabled={!valid} onPress={() => save.mutate()}>{billId ? 'Save changes' : 'Save draft'}</ModernButton>
      </ScrollView>

      <SelectionSheet visible={vendorPicker} title="Vendor" searchPlaceholder="Search vendors" searchQuery={search} onSearchChange={setSearch} onClose={() => setVendorPicker(false)} loading={vendors.isLoading} empty={(vendors.data ?? []).length === 0} emptyTitle="No vendors" emptyDescription="Create a vendor on the web first.">
        {(vendors.data ?? []).filter((vendor) => vendor.isActive && (!search || vendor.name.toLowerCase().includes(search.toLowerCase()))).map((vendor) => <SelectionRow key={vendor.id} title={vendor.name} subtitle={`${vendor.paymentTermDays} day terms`} selected={vendor.id === form.vendorId} onPress={() => { setForm({ ...form, vendorId: vendor.id, dueDate: plusDays(form.issueDate, vendor.paymentTermDays) }); setVendorPicker(false); }} />)}
      </SelectionSheet>
      <SelectionSheet visible={accountLine !== null} title="Account" searchPlaceholder="Search accounts" searchQuery={search} onSearchChange={setSearch} onClose={() => setAccountLine(null)} loading={accounts.isLoading} empty={eligibleAccounts.length === 0} emptyTitle="No expense accounts" emptyDescription="Initialize the chart of accounts before receiving bills.">
        {eligibleAccounts.filter((account) => !search || account.name.toLowerCase().includes(search.toLowerCase())).map((account) => <SelectionRow key={account.id} title={account.name} subtitle={account.accountNumber ?? account.accountClass ?? account.type} selected={accountLine !== null && form.lines[accountLine]?.accountId === account.id} onPress={() => { if (accountLine !== null) updateLine(accountLine, { accountId: account.id }); setAccountLine(null); }} />)}
      </SelectionSheet>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.background },
  content: { paddingHorizontal: space.screen, paddingTop: space.lg, paddingBottom: 48 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.sm, marginBottom: space.md },
  sectionTitle: { ...type.headline },
  addButton: { minHeight: control.touchTarget, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: palette.accentFill },
  addLabel: { ...type.subhead, color: palette.accentForeground, fontWeight: '600' },
  iconButton: { minWidth: control.touchTarget, minHeight: control.touchTarget, alignItems: 'center', justifyContent: 'center' },
  lineCard: { backgroundColor: palette.surface, borderRadius: radius.group, padding: space.lg, marginBottom: space.lg },
  lineHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.lg },
  lineTitle: { ...type.callout, color: palette.text, fontWeight: '700' },
  fieldRow: { flexDirection: 'row', gap: space.sm },
  field: { flex: 1 },
  smallField: { width: 76 },
  error: { ...type.footnote, color: palette.danger, marginBottom: space.lg },
});
