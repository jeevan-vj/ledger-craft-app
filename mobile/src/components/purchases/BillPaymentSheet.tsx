import React, { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { BankAccountDto, BillDto, RecordBillPaymentRequest } from '@/features/purchases/api/purchasesApi';
import { GroupedSection } from '@/components/ui/GroupedSection';
import { ListRow } from '@/components/ui/ListRow';
import { ModernButton } from '@/components/ui/ModernButton';
import { ModernInput } from '@/components/ui/ModernInput';
import { SelectionRow, SelectionSheet } from '@/components/ui/SelectionSheet';
import { SmartDatePicker } from '@/components/ui/SmartDatePicker';
import { space } from '@/theme/tokens';
import { formatMoney } from '@/utils/money';
import { createBillPaymentDraft } from '@/features/purchases/model/purchaseForms';
import { localIsoDate } from '@/components/ui/datePickerModel';
import { useTheme } from '@/theme';

interface Props {
  bill: BillDto;
  bankAccounts: BankAccountDto[];
  visible: boolean;
  saving: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (input: RecordBillPaymentRequest) => void;
}

export function BillPaymentSheet({ bill, bankAccounts, visible, saving, error, onClose, onSubmit }: Props) {
  const theme = useTheme();
  const { colors: palette, type } = theme;
  const styles = createStyles(theme);
  const initialDraft = createBillPaymentDraft(bill.balanceDue, localIsoDate(new Date()));
  const [bankAccountId, setBankAccountId] = useState(initialDraft.bankAccountId);
  const [amount, setAmount] = useState(initialDraft.amount);
  const [paymentDate, setPaymentDate] = useState(initialDraft.paymentDate);
  const [referenceNumber, setReferenceNumber] = useState(initialDraft.referenceNumber);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!visible) return;
    const draft = createBillPaymentDraft(bill.balanceDue, localIsoDate(new Date()));
    setBankAccountId(draft.bankAccountId);
    setAmount(draft.amount);
    setPaymentDate(draft.paymentDate);
    setReferenceNumber(draft.referenceNumber);
    setSearch('');
    setPickerVisible(false);
  }, [bill.balanceDue, bill.id, visible]);
  const selected = bankAccounts.find((account) => account.id === bankAccountId);
  const filtered = useMemo(() => bankAccounts.filter((account) =>
    !search || `${account.accountName} ${account.bankName}`.toLowerCase().includes(search.toLowerCase())), [bankAccounts, search]);
  const validAmount = Number(amount) > 0 && Number(amount) <= Number(bill.balanceDue);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.heading}>
              <Text style={styles.title}>Record payment</Text>
              <Text style={styles.subtitle}>{bill.billNumber} · {formatMoney(Number(bill.balanceDue), bill.currency)} remaining</Text>
            </View>
            <GroupedSection title="Payment account">
              <ListRow label="Paid from" value={selected?.accountName} placeholder="Choose account" accessibilityHint="Opens the payment account picker" onPress={() => setPickerVisible(true)} />
            </GroupedSection>
            <ModernInput label="Amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" error={amount && !validAmount ? `Enter up to ${bill.balanceDue}` : undefined} />
            <SmartDatePicker label="Payment date" value={paymentDate} showPresets={false} onChangeDate={setPaymentDate} />
            <ModernInput label="Reference (optional)" value={referenceNumber} onChangeText={setReferenceNumber} autoCapitalize="characters" />
            {error ? <Text style={styles.error} selectable>{error}</Text> : null}
            <View style={styles.actions}>
              <ModernButton variant="secondary" fullWidth onPress={onClose} disabled={saving}>Cancel</ModernButton>
              <ModernButton fullWidth onPress={() => onSubmit({ bankAccountId, amount, paymentDate, referenceNumber: referenceNumber.trim() || null })} loading={saving} disabled={!bankAccountId || !validAmount}>Record payment</ModernButton>
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
            selected={account.id === bankAccountId}
            onPress={() => { setBankAccountId(account.id); setPickerVisible(false); }}
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
