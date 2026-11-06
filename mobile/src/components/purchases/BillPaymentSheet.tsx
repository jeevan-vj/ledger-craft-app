import React, { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { BankAccountDto, BillDto, RecordBillPaymentRequest } from '@/features/purchases/api/purchasesApi';
import { SettlementRatePicker } from '@/components/currency/SettlementRatePicker';
import { pendingBillPayment, type PendingBillPayment } from '@/features/purchases/model/pendingBillPayment';
import { GroupedSection } from '@/components/ui/GroupedSection';
import { ListRow } from '@/components/ui/ListRow';
import { ModernButton } from '@/components/ui/ModernButton';
import { ModernInput } from '@/components/ui/ModernInput';
import { SelectionRow, SelectionSheet } from '@/components/ui/SelectionSheet';
import { SmartDatePicker } from '@/components/ui/SmartDatePicker';
import { space } from '@/theme/tokens';
import { formatMoney } from '@/utils/money';
import { createBillPaymentDraft, isPaymentAmountValid } from '@/features/purchases/model/purchaseForms';
import { localIsoDate } from '@/components/ui/datePickerModel';
import { useTheme } from '@/theme';

interface Props {
  bill: BillDto;
  ownerId: string;
  attemptRevision: number;
  bankAccounts: BankAccountDto[];
  visible: boolean;
  saving: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (input: RecordBillPaymentRequest, key: string) => void;
}

export function BillPaymentSheet({ bill, ownerId, attemptRevision, bankAccounts, visible, saving, error, onClose, onSubmit }: Props) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const initialDraft = createBillPaymentDraft(bill.balanceDue, localIsoDate(new Date()));
  const [allocations, setAllocations] = useState([{ bankAccountId: initialDraft.bankAccountId, amount: initialDraft.amount }]);
  const [paymentDate, setPaymentDate] = useState(initialDraft.paymentDate);
  const [exchangeRateId, setExchangeRateId] = useState<string>();
  const [referenceNumber, setReferenceNumber] = useState(initialDraft.referenceNumber);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerIndex, setPickerIndex] = useState(0);
  const submitting = useRef(false);
  const [pending, setPending] = useState<PendingBillPayment | null>(null);
  const [persisting, setPersisting] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!visible) return;
    const draft = createBillPaymentDraft(bill.balanceDue, localIsoDate(new Date()));
    setAllocations([{ bankAccountId: draft.bankAccountId, amount: draft.amount }]);
    setPaymentDate(draft.paymentDate);
    setExchangeRateId(undefined);
    setReferenceNumber(draft.referenceNumber);
    setSearch('');
    setPickerVisible(false); setPending(null); setStorageError(''); setPersisting(true);
    let active = true;
    void pendingBillPayment.load(ownerId, bill.id).then(async (saved) => { if (!active || !saved) return; await pendingBillPayment.fail(ownerId, bill.id, 0); if (!active) return; setPending({ ...saved, uncertain: true }); setAllocations(saved.input.allocations ?? [{ bankAccountId: saved.input.bankAccountId ?? '', amount: saved.input.amount ?? '' }]); setPaymentDate(saved.input.paymentDate); setReferenceNumber(saved.input.referenceNumber ?? ''); setExchangeRateId(saved.input.exchangeRateId); }).catch((caught) => { if (active) setStorageError(caught instanceof Error ? caught.message : 'Payment attempt unavailable.'); }).finally(() => { if (active) setPersisting(false); });
    return () => { active = false; };
  }, [bill.balanceDue, bill.id, ownerId, attemptRevision, visible]);
  const filtered = useMemo(() => bankAccounts.filter((account) =>
    (bill.currency === 'NZD' || account.currency === 'NZD') && (!search || `${account.accountName} ${account.bankName}`.toLowerCase().includes(search.toLowerCase()))), [bankAccounts, bill.currency, search]);
  const validAllocations = allocations.every((allocation) => allocation.bankAccountId && isPaymentAmountValid(allocation.amount, bill.balanceDue));

  const locked = saving || persisting || Boolean(pending);
  async function submit() {
    if (submitting.current || saving || persisting || storageError) return;
    submitting.current = true; setPersisting(true);
    try {
      const input = allocations.length === 1 ? { ...allocations[0], ...(exchangeRateId ? { exchangeRateId } : {}), paymentDate, referenceNumber: referenceNumber.trim() || null } : { allocations, ...(exchangeRateId ? { exchangeRateId } : {}), paymentDate, referenceNumber: referenceNumber.trim() || null };
      const attempt = pending ?? await pendingBillPayment.claim(ownerId, bill.id, input); setPending(attempt); onSubmit(attempt.input, attempt.key);
    } catch (caught) { setStorageError(caught instanceof Error ? caught.message : 'Could not safely retain this payment attempt.'); }
    finally { submitting.current = false; setPersisting(false); }
  }
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.heading}>
              <Text style={styles.title}>Record payment</Text>
              <Text style={styles.subtitle}>{bill.billNumber} · {formatMoney(bill.balanceDue, bill.currency)} remaining</Text>
            </View>
            {pending ? <Text style={styles.subtitle}>A saved bill payment is awaiting confirmation. Retry these same details before starting another payment. If it remains unresolved, check this bill’s payment history.</Text> : null}
            {storageError ? <Text accessibilityRole="alert" style={styles.error}>{storageError}</Text> : null}
            {allocations.map((allocation, index) => {
              const account = bankAccounts.find((item) => item.id === allocation.bankAccountId);
              return <View key={index}><GroupedSection title={allocations.length > 1 ? `Allocation ${index + 1}` : 'Payment account'}><ListRow disabled={locked} label="Paid from" value={account?.accountName} placeholder="Choose account" accessibilityHint="Opens the payment account picker" onPress={() => { setPickerIndex(index); setPickerVisible(true); }} /></GroupedSection><ModernInput editable={!locked} label="Amount" value={allocation.amount} onChangeText={(value) => setAllocations((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, amount: value } : row))} keyboardType="decimal-pad" /></View>;
            })}
            <ModernButton variant="secondary" fullWidth disabled={locked} onPress={() => setAllocations((rows) => [...rows, { bankAccountId: '', amount: '' }])}>Split across another account</ModernButton>
            <View pointerEvents={locked ? 'none' : 'auto'}><SmartDatePicker label="Payment date" value={paymentDate} showPresets={false} onChangeDate={(value) => { setPaymentDate(value); setExchangeRateId(undefined); }} /></View>
            <SettlementRatePicker currency={bill.currency} paymentDate={paymentDate} value={exchangeRateId} disabled={locked} onChange={setExchangeRateId} />
            <ModernInput editable={!locked} label="Reference (optional)" value={referenceNumber} onChangeText={setReferenceNumber} autoCapitalize="characters" />
            {error ? <Text style={styles.error} selectable>{error}</Text> : null}
            <View style={styles.actions}>
              <ModernButton variant="secondary" fullWidth onPress={onClose} disabled={saving}>Cancel</ModernButton>
              <ModernButton fullWidth onPress={() => void submit()} loading={saving || persisting} disabled={saving || persisting || Boolean(storageError) || (!pending && (!validAllocations || (bill.currency !== 'NZD' && !exchangeRateId)))}>Record payment</ModernButton>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
      <SelectionSheet
        visible={pickerVisible}
        title="Payment account"
        searchPlaceholder="Search accounts"
        searchQuery={search}
        onSearchChange={setSearch}
        onClose={() => setPickerVisible(false)}
        loading={false}
        empty={filtered.length === 0}
        emptyTitle="No bank accounts"
        emptyDescription="Create a bank account in LedgerCraft before paying a bill."
      >
        {filtered.map((account) => (
          <SelectionRow
            key={account.id}
            title={account.accountName}
            subtitle={`${account.bankName} · ${account.currency}`}
            selected={account.id === allocations[pickerIndex]?.bankAccountId}
            onPress={() => { setAllocations((rows) => rows.map((row, index) => index === pickerIndex ? { ...row, bankAccountId: account.id } : row)); setPickerVisible(false); }}
          />
        ))}
      </SelectionSheet>
    </Modal>
  );
}

const createStyles = ({ colors: palette, type }: ReturnType<typeof useTheme>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
  content: { paddingHorizontal: space.screen, paddingTop: space.xxl, paddingBottom: 48 },
  heading: { marginBottom: space.xxl },
  title: { ...type.title },
  subtitle: { ...type.subhead, marginTop: space.xs },
  error: { ...type.footnote, color: palette.danger, marginBottom: space.lg },
  actions: { gap: space.md },
});
