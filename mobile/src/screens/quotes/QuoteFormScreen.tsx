import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { onlineManager, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CustomerPicker } from '@/components/customers/CustomerPicker';
import { CompactLineItem } from '@/components/invoice/CompactLineItem';
import InvoicePreviewWithTemplates from '@/components/invoice/InvoicePreviewWithTemplates';
import { TaxConfigCard } from '@/components/invoice/TaxConfigCard';
import { ItemPicker } from '@/components/items/ItemPicker';
import { AppPressable } from '@/components/ui/AppPressable';
import { EmptyState } from '@/components/ui/EmptyState';
import { ModernInput } from '@/components/ui/ModernInput';
import { NativeHeaderButton } from '@/components/ui/NativeHeaderButton';
import { SmartDatePicker } from '@/components/ui/SmartDatePicker';
import { customersApi } from '@/features/customers/api/customersApi';
import { quotesApi, type QuoteWriteInput } from '@/features/quotes/api/quotesApi';
import {
  addCalendarDays,
  createSingleFlight,
  decimalText,
  mutationFailureMessage,
  quoteDraftError,
  quoteKindLabel,
  quoteToPreviewInvoice,
  todayIsoDate,
} from '@/features/quotes/quoteModel';
import type { InvoiceStackParamList } from '@/navigation/types';
import { businessProfileService } from '@/services/businessProfileService';
import type { Customer } from '@/services/customerService';
import type { Item } from '@/services/itemService';
import type { LineItem } from '@/types/invoice';
import type { QuoteKind } from '@/types/quote';
import type { InvoiceTemplateId } from '@/types/invoiceTemplates';
import { quoteDocumentLabels } from '@/utils/invoiceTemplates';
import { formatMoney } from '@/utils/money';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme';

type Navigation = NativeStackNavigationProp<InvoiceStackParamList, 'QuoteCreate'>;
type FormRoute = RouteProp<InvoiceStackParamList, 'QuoteCreate' | 'QuoteEdit'>;

const blankLine = (): LineItem => ({
  id: `line-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  description: '',
  quantity: 1,
  unit: 'ea',
  rate: 0,
  total: 0,
});

export default function QuoteFormScreen() {
  const theme = useTheme();
  const { colors: palette } = theme;
  const styles = createStyles(theme);
  const navigation = useNavigation<Navigation>();
  const route = useRoute<FormRoute>();
  const queryClient = useQueryClient();
  const params = route.params as { quoteId?: string; customerId?: string } | undefined;
  const quoteId = route.name === 'QuoteEdit' ? params?.quoteId : undefined;
  const requestedCustomerId = route.name === 'QuoteCreate' ? params?.customerId : undefined;
  const saveFlight = useRef(createSingleFlight());
  const hydrated = useRef(false);
  const [kind, setKind] = useState<QuoteKind>('quote');
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [date, setDate] = useState(todayIsoDate());
  const [expiryDate, setExpiryDate] = useState(addCalendarDays(todayIsoDate(), 30));
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('');
  const [currency, setCurrency] = useState('NZD');
  const [templateName, setTemplateName] = useState<InvoiceTemplateId>('classic');
  const [lineItems, setLineItems] = useState<LineItem[]>([blankLine()]);
  const [taxEnabled, setTaxEnabled] = useState(true);
  const [taxRate, setTaxRate] = useState(15);
  const [taxInclusive, setTaxInclusive] = useState(false);
  const taxTouched = useRef(false);
  const [quoteNumber, setQuoteNumber] = useState('');
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [showItemPicker, setShowItemPicker] = useState(false);
  const [lineIndex, setLineIndex] = useState<number | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);

  const profileQuery = useQuery({
    queryKey: ['business-profile'],
    queryFn: () => businessProfileService.getBusinessProfile(),
  });
  const customersQuery = useQuery({ queryKey: ['customers'], queryFn: () => customersApi.list() });
  const quoteQuery = useQuery({
    queryKey: ['quotes', 'detail', quoteId],
    queryFn: () => quotesApi.get(quoteId!),
    enabled: Boolean(quoteId),
  });
  const numberQuery = useQuery({
    queryKey: ['quotes', 'next-number'],
    queryFn: () => quotesApi.nextNumber(),
    enabled: !quoteId,
  });

  useEffect(() => {
    if (hydrated.current) return;
    if (quoteId) {
      const quote = quoteQuery.data;
      if (!quote) return;
      setKind(quote.kind);
      setCustomerId(quote.customerId);
      setCustomerName(quote.customerName ?? '');
      setDate(quote.date);
      setExpiryDate(quote.expiryDate);
      setNotes(quote.notes ?? '');
      setTerms(quote.terms ?? '');
      setCurrency(quote.currency || 'NZD');
      setTemplateName((quote.templateName as InvoiceTemplateId | null) ?? 'classic');
      setTaxInclusive(quote.taxInclusive);
      setTaxRate(Number(quote.taxRate) || 0);
      setTaxEnabled(Number(quote.taxRate) > 0);
      setQuoteNumber(quote.quoteNumber);
      setLineItems(quote.items.length ? quote.items.map((item) => ({
        id: item.id,
        description: item.description,
        quantity: Number(item.quantity),
        unit: item.unit || 'ea',
        rate: Number(item.rate),
        total: Number(item.total),
      })) : [blankLine()]);
      hydrated.current = true;
      return;
    }
    if (!profileQuery.isFetched || !customersQuery.isFetched || !numberQuery.isFetched) return;
    const profile = profileQuery.data;
    const start = todayIsoDate();
    setDate(start);
    setExpiryDate(addCalendarDays(start, profile?.quoteValidityDays ?? 30));
    setKind(profile?.defaultQuoteKind ?? 'quote');
    setTaxRate(profile?.defaultTaxRate ?? 15);
    setTaxEnabled((profile?.defaultTaxRate ?? 15) > 0);
    setNotes(profile?.defaultNotes ?? '');
    setTerms(profile?.defaultTerms ?? '');
    setQuoteNumber(numberQuery.data ?? '');
    const match = customersQuery.data?.find((customer) => customer.id === requestedCustomerId) ?? customersQuery.data?.[0];
    if (match) {
      setCustomerId(match.id);
      setCustomerName(match.name);
    }
    hydrated.current = true;
  }, [customersQuery.data, customersQuery.isFetched, numberQuery.data, numberQuery.isFetched, profileQuery.data, profileQuery.isFetched, quoteId, quoteQuery.data, requestedCustomerId]);

  const previewSubtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
  const previewTax = taxEnabled ? (previewSubtotal * taxRate) / 100 : 0;
  const previewTotal = previewSubtotal + previewTax;
  const formatCurrency = (amount: number) => formatMoney(amount, currency);
  const label = quoteKindLabel(kind);

  const updateLine = (index: number, field: keyof LineItem, value: string | number) => {
    setLineItems((current) => current.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      const next = { ...item, [field]: value };
      if (field === 'quantity' || field === 'rate') next.total = Number(next.quantity) * Number(next.rate);
      return next;
    }));
  };

  const buildInput = (): QuoteWriteInput => ({
    customerId,
    date,
    expiryDate,
    kind,
    notes: notes.trim() ? notes.trim() : null,
    terms: terms.trim() ? terms.trim() : null,
    currency,
    templateName,
    taxInclusive: taxTouched.current ? false : taxInclusive,
    taxRate: taxEnabled ? decimalText(taxRate) : '0',
    items: lineItems.filter((item) => item.description.trim()),
  });

  const save = async () => {
    const error = quoteDraftError({ customerId, date, expiryDate, items: lineItems });
    if (error) {
      Alert.alert('Check the quote', error);
      return;
    }
    const key = saveFlight.current.claim();
    if (!key) return;
    setSaving(true);
    try {
      const saved = quoteId
        ? await quotesApi.update(quoteId, buildInput())
        : await quotesApi.create(buildInput(), key);
      await queryClient.invalidateQueries({ queryKey: ['quotes'] });
      navigation.replace('QuoteDetail', { quoteId: saved.id });
    } catch (saveError) {
      saveFlight.current.release();
      Alert.alert(`Could not save ${label.toLowerCase()}`, mutationFailureMessage(saveError, onlineManager.isOnline()));
    } finally {
      setSaving(false);
    }
  };

  const saveRef = useRef(save);
  saveRef.current = save;

  useLayoutEffect(() => {
    navigation.setOptions({
      title: quoteId ? `Edit ${label.toLowerCase()}` : `New ${label.toLowerCase()}`,
      headerLeft: () => <NativeHeaderButton label="Cancel" onPress={() => Alert.alert('Discard changes?', 'This quote will not be saved.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() },
      ])} />,
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <NativeHeaderButton label="Preview" onPress={() => {
            const error = quoteDraftError({ customerId, date, expiryDate, items: lineItems });
            if (error) Alert.alert('Check the quote', error);
            else setShowPreview(true);
          }} />
          <NativeHeaderButton label={saving ? 'Saving' : 'Save'} primary disabled={saving} onPress={() => saveRef.current()} />
        </View>
      ),
    });
  }, [customerId, date, expiryDate, label, lineItems, navigation, quoteId, saving]);

  const previewInvoice = useMemo(() => quoteToPreviewInvoice({
    id: quoteId ?? 'preview',
    quoteNumber: quoteNumber || 'Draft',
    kind,
    revision: 1,
    customerId,
    customerName,
    date,
    expiryDate,
    subtotal: decimalText(previewSubtotal),
    taxAmount: decimalText(previewTax),
    taxRate: decimalText(taxRate),
    taxInclusive,
    discountType: 'fixed',
    discountPercent: null,
    discount: null,
    additionalCharges: null,
    total: decimalText(previewTotal),
    notes,
    terms,
    currency,
    templateName,
    status: 'draft',
    sentAt: null,
    publicViewedAt: null,
    respondedAt: null,
    respondedByName: null,
    responseNote: null,
    acceptedRevision: null,
    convertedInvoiceId: null,
    convertedInvoiceNumber: null,
    items: [],
    createdAt: '',
    updatedAt: '',
  }, lineItems), [currency, customerId, customerName, date, expiryDate, kind, lineItems, notes, previewSubtotal, previewTax, previewTotal, quoteId, quoteNumber, taxInclusive, taxRate, templateName, terms]);

  if ((quoteId && quoteQuery.isLoading) || (!quoteId && customersQuery.isLoading && !customersQuery.data)) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={palette.accent} accessibilityLabel="Loading quote" />
      </View>
    );
  }

  if (quoteId && quoteQuery.isError) {
    return (
      <View style={styles.center}>
        <EmptyState
          title="Couldn’t load quote"
          description={mutationFailureMessage(quoteQuery.error, onlineManager.isOnline())}
          actionLabel="Try again"
          onAction={() => quoteQuery.refetch()}
        />
      </View>
    );
  }

  if (quoteQuery.data && quoteQuery.data.status !== 'draft') {
    return (
      <View style={styles.center}>
        <EmptyState
          title="Only drafts can be edited"
          description="Revise the quote to start a new draft. Old share links stop working."
          actionLabel="View quote"
          onAction={() => navigation.replace('QuoteDetail', { quoteId: quoteQuery.data.id })}
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.section}>Quote or estimate</Text>
        <View style={styles.kindRow}>
          {(['quote', 'estimate'] as const).map((option) => {
            const selected = kind === option;
            return (
              <AppPressable
                key={option}
                accessibilityRole="button"
                accessibilityLabel={quoteKindLabel(option)}
                accessibilityState={{ selected }}
                onPress={() => setKind(option)}
                style={({ pressed }) => [styles.kind, selected && styles.kindSelected, pressed && styles.pressed]}
              >
                <Text style={[styles.kindLabel, selected && styles.kindLabelSelected]}>{quoteKindLabel(option)}</Text>
              </AppPressable>
            );
          })}
        </View>
        <Text style={styles.helper}>{quoteNumber ? `Number ${quoteNumber}` : 'A quote number is assigned when you save.'} Totals are confirmed by the server after you save.</Text>

        <Text style={styles.section}>Customer</Text>
        <AppPressable
          accessibilityRole="button"
          accessibilityLabel={customerName ? `Customer ${customerName}` : 'Choose a customer'}
          onPress={() => setShowCustomerPicker(true)}
          style={({ pressed }) => [styles.selector, pressed && styles.pressed]}
        >
          <Feather name="user" size={18} color={palette.accentText} />
          <Text style={[styles.selectorText, !customerName && styles.placeholder]}>{customerName || 'Choose a customer'}</Text>
          <Feather name="chevron-right" size={18} color={palette.textTertiary} />
        </AppPressable>

        <SmartDatePicker label="Quote date" value={date} onChangeDate={setDate} />
        <SmartDatePicker label="Valid until" value={expiryDate} onChangeDate={setExpiryDate} minimumDate={new Date(`${date}T00:00:00`)} />

        <Text style={styles.section}>Line items</Text>
        {lineItems.map((item, index) => (
          <CompactLineItem
            key={item.id}
            item={item}
            index={index}
            canRemove={lineItems.length > 1}
            formatCurrency={formatCurrency}
            onUpdate={updateLine}
            onRemove={(target) => setLineItems((current) => current.filter((_, itemIndex) => itemIndex !== target))}
            onSelectItem={(target) => { setLineIndex(target); setShowItemPicker(true); }}
          />
        ))}
        <AppPressable
          accessibilityRole="button"
          accessibilityLabel="Add line item"
          onPress={() => setLineItems((current) => [...current, blankLine()])}
          style={({ pressed }) => [styles.add, pressed && styles.pressed]}
        >
          <Feather name="plus" size={18} color={palette.accentForeground} />
          <Text style={styles.addLabel}>Add line</Text>
        </AppPressable>

        <TaxConfigCard
          taxEnabled={taxEnabled}
          taxRate={taxRate}
          subtotal={previewSubtotal}
          taxAmount={previewTax}
          total={previewTotal}
          formatCurrency={formatCurrency}
          onTaxEnabledChange={(enabled) => { taxTouched.current = true; setTaxEnabled(enabled); if (!enabled) setTaxInclusive(false); }}
          onTaxRateChange={(rate) => { taxTouched.current = true; setTaxRate(rate); }}
        />
        <Text style={styles.helper}>This preview adds the line amounts. The saved GST and total come back from the server and are shown on the quote.</Text>

        <ModernInput label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional note for the customer" multiline />
        <ModernInput label="Terms" value={terms} onChangeText={setTerms} placeholder="Optional terms" multiline />
      </ScrollView>

      <CustomerPicker
        visible={showCustomerPicker}
        selectedCustomerId={customerId}
        onClose={() => setShowCustomerPicker(false)}
        onSelect={(customer: Customer) => {
          setCustomerId(customer.id);
          setCustomerName(customer.name);
          setShowCustomerPicker(false);
        }}
      />
      <ItemPicker
        visible={showItemPicker}
        onClose={() => setShowItemPicker(false)}
        onSelect={(item: Item) => {
          if (lineIndex == null) return;
          const rate = Number(item.salePrice || 0);
          setLineItems((current) => current.map((line, index) => index === lineIndex ? {
            ...line,
            description: item.name,
            unit: item.unit || 'ea',
            rate,
            total: line.quantity * rate,
          } : line));
          setShowItemPicker(false);
        }}
      />
      <Modal visible={showPreview} animationType="slide" onRequestClose={() => setShowPreview(false)}>
        <InvoicePreviewWithTemplates
          invoice={previewInvoice}
          businessProfile={profileQuery.data ?? undefined}
          initialTemplate={templateName}
          labels={quoteDocumentLabels(kind)}
          filePrefix={label}
          onClose={() => setShowPreview(false)}
        />
      </Modal>
    </KeyboardAvoidingView>
  );
}

const createStyles = ({ colors: palette, type }: ReturnType<typeof useTheme>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.background, padding: space.screen },
  content: { padding: space.screen, paddingBottom: 48 },
  section: { ...type.section, marginBottom: space.sm, marginTop: space.md },
  kindRow: { flexDirection: 'row', gap: space.sm, marginBottom: space.sm },
  kind: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: palette.fill },
  kindSelected: { backgroundColor: palette.accent },
  kindLabel: { ...type.callout, color: palette.text },
  kindLabelSelected: { color: palette.accentForeground },
  pressed: { opacity: 0.7 },
  helper: { ...type.footnote, marginBottom: space.md },
  selector: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: space.lg, borderRadius: 16, backgroundColor: palette.surface, marginBottom: space.md },
  selectorText: { ...type.body, flex: 1 },
  placeholder: { color: palette.textTertiary },
  add: { minHeight: 48, borderRadius: 999, backgroundColor: palette.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: space.lg },
  addLabel: { ...type.callout, color: palette.accentForeground },
});
