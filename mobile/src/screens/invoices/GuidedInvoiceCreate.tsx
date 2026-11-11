import { isNzBusinessCountry } from '@ledgercraft/contracts';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ModernInput } from '@/components/ui/ModernInput';
import { NativeHeaderButton } from '@/components/ui/NativeHeaderButton';
import { PillButton } from '@/components/ui/PillButton';
import {
  buildInvoiceDraft,
  customerStepError,
  defaultInvoiceDates,
  invoiceTotals,
  lineStepError,
  matchedCustomerId,
  newInvoiceDefaults,
  parseMoneyInput,
  type InvoiceDates,
} from '@/features/invoices/firstInvoiceModel';
import { businessProfileService, type BusinessProfile } from '@/services/businessProfileService';
import { customerService } from '@/services/customerService';
import { invoiceService } from '@/services/invoiceService';
import { AuthApiError } from '@/features/auth/api/http';
import { useTabScreenInsets } from '@/hooks/useTabScreenInsets';
import type { InvoiceStackParamList } from '@/navigation/types';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme';
import { formatMoney } from '@/utils/money';
import { invoiceBuyerFix } from '@/utils/invoiceBuyerCompliance';

type Navigation = NativeStackNavigationProp<InvoiceStackParamList, 'InvoiceCreate'>;

interface ListedCustomer {
  id: string;
  name: string;
  email?: string | null;
}

const stepCopy = [
  {
    title: 'Who is this invoice for?',
    body: 'Choose a customer, or add someone new. Email is optional.',
  },
  {
    title: 'What are you charging?',
    body: 'One line is enough. You can add more after you save.',
  },
  {
    title: 'Review and save',
    body: 'This saves a draft. You can preview and send it next.',
  },
] as const;

interface GuidedInvoiceCreateProps {
  requestedCustomerId?: string;
}

export default function GuidedInvoiceCreate({ requestedCustomerId }: GuidedInvoiceCreateProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const navigation = useNavigation<Navigation>();
  const { bottomPadding } = useTabScreenInsets();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [customers, setCustomers] = useState<ListedCustomer[]>([]);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [addingNewCustomer, setAddingNewCustomer] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [description, setDescription] = useState('');
  const [zeroRatedChoice, setZeroRatedChoice] = useState<'zero_rated' | 'exempt' | null>(null);
  const [amount, setAmount] = useState('');
  const [dates, setDates] = useState<InvoiceDates>(() => defaultInvoiceDates());
  const savingRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(undefined);
    try {
      const [number, customerList, businessProfile] = await Promise.all([
        invoiceService.generateInvoiceNumber(),
        invoiceService.fetchCustomers(),
        businessProfileService.getBusinessProfile(),
      ]);
      if (!number.trim()) throw new Error('Invoice number was empty');
      if (!businessProfile) throw new Error('Business profile is missing');
      setInvoiceNumber(number.trim());
      setCustomers(customerList);
      setProfile(businessProfile);
      const requestedId = matchedCustomerId(customerList, requestedCustomerId);
      setSelectedCustomerId(requestedId);
      setAddingNewCustomer(!requestedId && customerList.length === 0);
      setDates(defaultInvoiceDates());
    } catch (caught) {
      console.error('Error preparing a new invoice:', caught);
      setLoadError('The invoice could not be prepared. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [requestedCustomerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const defaults = newInvoiceDefaults(profile);
  const parsedAmount = parseMoneyInput(amount) ?? 0;
  const totals = invoiceTotals(parsedAmount, defaults.taxEnabled, defaults.taxRate);
  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId) ?? null;
  const reviewName = selectedCustomer?.name || customerName.trim();
  const reviewEmail = selectedCustomer?.email || customerEmail.trim();

  const dirty = Boolean(
    addingNewCustomer || customerName.trim() || customerEmail.trim() || selectedCustomerId || description.trim() || amount.trim(),
  );

  const cancel = useCallback(() => {
    if (!dirty) {
      navigation.goBack();
      return;
    }
    Alert.alert('Discard this invoice?', 'The customer and amount you entered will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() },
    ]);
  }, [dirty, navigation]);

  useEffect(() => {
    navigation.setOptions({
      title: 'New invoice',
      headerBackVisible: false,
      headerLeft: () => (
        <NativeHeaderButton
          label={step === 0 ? 'Cancel' : 'Back'}
          onPress={() => {
            if (step === 0) cancel();
            else {
              setError(undefined);
              setStep((current) => current - 1);
            }
          }}
          disabled={saving}
        />
      ),
      headerRight: () => null,
    });
  }, [navigation, step, saving, cancel]);

  const continueFlow = () => {
    if (step === 0) {
      const validation = !selectedCustomerId && !addingNewCustomer
        ? 'Choose a customer or add someone new.'
        : customerStepError({
            selectedId: selectedCustomerId,
            name: customerName,
            email: customerEmail,
          });
      if (validation) {
        setError(validation);
        return;
      }
      setError(undefined);
      setStep(1);
      return;
    }
    if (step === 1) {
      const validation = lineStepError(description, amount);
      if (validation) {
        setError(validation);
        return;
      }
      setError(undefined);
      setStep(2);
    }
  };

  const save = async () => {
    if (savingRef.current || !profile) return;
    const amountValue = parseMoneyInput(amount);
    const validation = (!selectedCustomerId && !addingNewCustomer
      ? 'Choose a customer or add someone new.'
      : customerStepError({
          selectedId: selectedCustomerId,
          name: customerName,
          email: customerEmail,
        })) || lineStepError(description, amount);
    const buyerFix = invoiceBuyerFix(totals.total, defaults.currency, isNzBusinessCountry(profile.country) ? profile.gstRegistrationStatus : undefined, selectedCustomer ?? { name: customerName, email: customerEmail });
    if (buyerFix) { setError(buyerFix); return; }
    if (validation || amountValue == null) {
      setError(validation || 'Enter an amount greater than zero.');
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setError(undefined);
    try {
      let customerId = selectedCustomerId;
      if (!customerId) {
        const created = await customerService.createCustomer({
          name: customerName.trim(),
          email: customerEmail.trim(),
          phone: null,
          address: null,
          city: null,
          state: null,
          zip: null,
          country: profile.country || 'New Zealand',
        });
        customerId = created.id;
        setSelectedCustomerId(created.id);
        setCustomerName('');
        setCustomerEmail('');
        setCustomers((current) => [...current, created]);
      }

      if (!defaults.taxEnabled && zeroRatedChoice == null) {
        setError('Choose zero-rated or exempt for a sale with no GST.');
        return;
      }
      const draft = buildInvoiceDraft({
        invoiceNumber,
        customerId,
        description,
        amount: amountValue,
        currency: defaults.currency,
        taxEnabled: defaults.taxEnabled,
        taxRate: defaults.taxRate,
        salesTaxCode: !defaults.taxEnabled ? zeroRatedChoice ?? undefined : defaults.taxRate === 15 ? 'standard_15' : undefined,
        notes: profile.defaultNotes,
        terms: profile.defaultTerms,
        dates,
      });
      const createdInvoice = await invoiceService.createInvoice(draft.invoice, draft.lineItems);
      if (!createdInvoice?.id) throw new Error('Saved invoice had no id');
      navigation.replace('InvoiceDetail', { invoiceId: createdInvoice.id, entry: 'create' });
    } catch (caught) {
      console.error('Error saving the first invoice:', caught);
      setError(caught instanceof AuthApiError && caught.code === 'GST_PERIOD_FILED' ? caught.message : 'The invoice could not be saved. Check your connection and try again.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.accent} />
        <Text style={styles.loadingText}>Preparing your invoice</Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Invoice not ready</Text>
        <Text style={styles.errorBody}>{loadError}</Text>
        <PillButton label="Try again" onPress={() => { void load(); }} />
      </View>
    );
  }

  const taxNote = defaults.taxEnabled
    ? `GST at ${defaults.taxRate}% will be added.`
    : 'No GST will be added.';

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      // Android's adjustResize already reserves the keyboard height.
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
    >
      <View style={styles.progress} accessibilityLabel={`Step ${step + 1} of ${stepCopy.length}`}>
        {stepCopy.map((item, index) => (
          <View key={item.title} style={[styles.progressTrack, index <= step && styles.progressTrackActive]} />
        ))}
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.stepCount}>{step + 1}/{stepCopy.length}</Text>
        <Text style={styles.title}>{stepCopy[step].title}</Text>
        <Text style={styles.subtitle}>{stepCopy[step].body}</Text>

        {step === 0 ? (
          <View style={styles.stack}>
            {customers.length > 0 ? (
              <View style={styles.stack} accessibilityRole="radiogroup" accessibilityLabel="Existing customers">
                {customers.map((customer) => {
                  const selected = customer.id === selectedCustomerId;
                  return (
                    <Pressable
                      key={customer.id}
                      accessibilityRole="radio"
                      accessibilityLabel={customer.name}
                      accessibilityState={{ selected }}
                      onPress={() => {
                        setSelectedCustomerId(customer.id);
                        setAddingNewCustomer(false);
                        setCustomerName('');
                        setCustomerEmail('');
                        setError(undefined);
                      }}
                      style={[styles.option, selected && styles.optionSelected]}
                    >
                      <View style={[styles.radio, selected && styles.radioSelected]}>
                        {selected ? <View style={styles.radioDot} /> : null}
                      </View>
                      <View style={styles.optionCopy}>
                        <Text style={styles.optionTitle}>{customer.name}</Text>
                        {customer.email ? <Text style={styles.optionBody}>{customer.email}</Text> : null}
                      </View>
                    </Pressable>
                  );
                })}
                <Pressable
                  accessibilityRole="radio"
                  accessibilityLabel="Add someone new"
                  accessibilityState={{ selected: addingNewCustomer }}
                  onPress={() => {
                    setSelectedCustomerId(null);
                    setAddingNewCustomer(true);
                    setError(undefined);
                  }}
                  style={[styles.option, addingNewCustomer && styles.optionSelected]}
                >
                  <View style={[styles.radio, addingNewCustomer && styles.radioSelected]}>
                    {addingNewCustomer ? <View style={styles.radioDot} /> : null}
                  </View>
                  <View style={styles.optionCopy}>
                    <Text style={styles.optionTitle}>Add someone new</Text>
                    <Text style={styles.optionBody}>Create a customer for this invoice</Text>
                  </View>
                </Pressable>
              </View>
            ) : null}
            {addingNewCustomer ? (
              <>
                <ModernInput
                  label="Customer name"
                  value={customerName}
                  onChangeText={(value) => {
                    setCustomerName(value);
                    setError(undefined);
                  }}
                  placeholder="Harbour Cafe"
                  autoCapitalize="words"
                  autoComplete="name"
                  returnKeyType="next"
                />
                <ModernInput
                  label="Email"
                  value={customerEmail}
                  onChangeText={(value) => {
                    setCustomerEmail(value);
                    setError(undefined);
                  }}
                  placeholder="name@email.com"
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  returnKeyType="done"
                  onSubmitEditing={continueFlow}
                />
              </>
            ) : null}
          </View>
        ) : null}

        {step === 1 ? (
          <View style={styles.stack}>
            <ModernInput
              label="Description"
              value={description}
              onChangeText={(value) => {
                setDescription(value);
                setError(undefined);
              }}
              placeholder="Logo design"
              autoCapitalize="sentences"
              returnKeyType="next"
            />
            <ModernInput
              label="Amount"
              value={amount}
              onChangeText={(value) => {
                setAmount(value);
                setError(undefined);
              }}
              placeholder="0.00"
              keyboardType="decimal-pad"
              returnKeyType="done"
              onSubmitEditing={continueFlow}
            />
            <View style={styles.note}>
              <Text style={styles.noteText}>{taxNote}</Text>
              <Text style={styles.noteText}>Amounts are in {defaults.currency}.</Text>
            </View>
            {!defaults.taxEnabled ? (
              <View style={styles.choiceRow}>
                {([
                  { id: 'zero_rated' as const, label: 'Zero-rated' },
                  { id: 'exempt' as const, label: 'Exempt' },
                ]).map((option) => {
                  const selected = zeroRatedChoice === option.id;
                  return (
                    <Pressable
                      key={option.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => { setZeroRatedChoice(option.id); setError(undefined); }}
                      style={[styles.choice, selected && styles.choiceSelected]}
                    >
                      <Text style={styles.choiceLabel}>{option.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
        ) : null}

        {step === 2 ? (
          <View style={styles.review}>
            <ReviewRow label="Customer" value={reviewName} detail={reviewEmail || undefined} />
            <ReviewRow label="Work" value={description.trim()} />
            <ReviewRow label="Amount" value={formatMoney(totals.subtotal, defaults.currency)} />
            <ReviewRow
              label={defaults.taxEnabled ? `GST ${defaults.taxRate}%` : 'GST'}
              value={defaults.taxEnabled ? formatMoney(totals.taxAmount, defaults.currency) : 'Not added'}
            />
            <ReviewRow label="Total" value={formatMoney(totals.total, defaults.currency)} emphasis />
            <ReviewRow label="Invoice" value={invoiceNumber} />
            <ReviewRow label="Due" value={formatInvoiceDate(dates.dueDate)} />
          </View>
        ) : null}

        {error ? (
          <Text style={styles.error} accessibilityLiveRegion="polite" testID="first-invoice-error">
            {error}
          </Text>
        ) : null}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: bottomPadding }]}>
        <PillButton
          label={step === 2 ? (saving ? 'Saving…' : 'Create draft') : 'Continue'}
          loading={saving}
          onPress={() => {
            if (step === 2) void save();
            else continueFlow();
          }}
          style={styles.footerButton}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

function ReviewRow({
  label,
  value,
  detail,
  emphasis = false,
}: {
  label: string;
  value: string;
  detail?: string;
  emphasis?: boolean;
}) {
  const theme = useTheme();
  const styles = createStyles(theme);
  return (
    <View style={styles.reviewRow}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <View style={styles.reviewValue}>
        <Text style={emphasis ? styles.reviewTotal : styles.reviewText}>{value}</Text>
        {detail ? <Text style={styles.reviewDetail}>{detail}</Text> : null}
      </View>
    </View>
  );
}

function formatInvoiceDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString('en-NZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

const createStyles = (theme: ReturnType<typeof useTheme>) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xxl,
    gap: space.md,
    backgroundColor: theme.colors.background,
  },
  loadingText: { ...theme.type.body, color: theme.colors.textSecondary },
  errorTitle: { ...theme.type.headline, textAlign: 'center' },
  errorBody: { ...theme.type.body, color: theme.colors.textSecondary, textAlign: 'center' },
  progress: { flexDirection: 'row', gap: 6, paddingHorizontal: space.xxl, paddingTop: space.md },
  progressTrack: { flex: 1, height: 5, borderRadius: 3, backgroundColor: theme.colors.fill },
  progressTrackActive: { backgroundColor: theme.colors.accent },
  content: { flexGrow: 1, paddingHorizontal: space.xxl, paddingTop: space.lg, paddingBottom: space.section },
  stepCount: { ...theme.type.caption, marginBottom: space.sm },
  title: { ...theme.type.display, fontSize: 32, lineHeight: 38, marginBottom: space.md },
  subtitle: { ...theme.type.body, color: theme.colors.textSecondary, lineHeight: 24, marginBottom: space.section },
  stack: { gap: space.md },
  fieldLabel: { ...theme.type.caption, marginTop: space.sm },
  option: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    padding: space.lg,
    gap: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.fillMuted,
  },
  optionSelected: { borderColor: theme.colors.accent, backgroundColor: theme.colors.accentFill },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.textSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: theme.colors.accentText },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: theme.colors.accentText },
  optionCopy: { flex: 1 },
  optionTitle: { ...theme.type.headline },
  optionBody: { ...theme.type.subhead, marginTop: 2 },
  note: {
    padding: space.lg,
    borderRadius: radius.md,
    backgroundColor: theme.colors.accentFill,
    gap: space.xs,
  },
  noteText: { ...theme.type.subhead },
  choiceRow: { flexDirection: 'row', gap: space.sm },
  choice: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.fillMuted,
  },
  choiceSelected: { borderColor: theme.colors.accent, backgroundColor: theme.colors.accentFill },
  choiceLabel: { ...theme.type.subhead, color: theme.colors.text },
  review: {
    backgroundColor: theme.colors.surface,
    borderRadius: radius.group,
    paddingHorizontal: space.lg,
  },
  reviewRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.separator,
  },
  reviewLabel: { ...theme.type.subhead, color: theme.colors.textSecondary },
  reviewValue: { flex: 1, alignItems: 'flex-end' },
  reviewText: { ...theme.type.callout, textAlign: 'right' },
  reviewTotal: { ...theme.type.headline, textAlign: 'right' },
  reviewDetail: { ...theme.type.footnote, textAlign: 'right', marginTop: 2 },
  error: { ...theme.type.footnote, color: theme.colors.danger, marginTop: space.md },
  footer: { paddingHorizontal: space.xxl, paddingTop: space.md },
  footerButton: { alignSelf: 'stretch' },
});
