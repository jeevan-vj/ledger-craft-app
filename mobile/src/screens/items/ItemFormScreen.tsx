import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, usePreventRemove, useRoute, type NavigationAction, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { EmptyState, FormSwitch, ListRow, ModernButton, ModernInput } from '@/components/ui';
import { SelectionRow, SelectionSheet } from '@/components/ui/SelectionSheet';
import { emptyItemDraft, hasItemFormChanged, itemDraftFromRecord, itemPayloadFromDraft, validateItemDraft } from '@/features/items/model/itemForms';
import type { MoreStackParamList } from '@/navigation/types';
import { itemService, type ItemCategory } from '@/services/itemService';
import { useTheme } from '@/theme';
import { space } from '@/theme/tokens';
import { errorHaptic, successHaptic } from '@/utils/haptics';

type Navigation = NativeStackNavigationProp<MoreStackParamList, 'ItemCreate'>;
type Route = RouteProp<MoreStackParamList, 'ItemCreate' | 'ItemEdit'>;

export default function ItemFormScreen() {
  const theme = useTheme(); const navigation = useNavigation<Navigation>(); const route = useRoute<Route>();
  const itemId = route.name === 'ItemEdit' ? (route.params as MoreStackParamList['ItemEdit']).itemId : undefined;
  const [initial, setInitial] = useState(emptyItemDraft); const [form, setForm] = useState(initial);
  const [categories, setCategories] = useState<ItemCategory[]>([]); const [loading, setLoading] = useState(Boolean(itemId));
  const [loadError, setLoadError] = useState<string | null>(null); const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null); const [submitted, setSubmitted] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false); const [categorySearch, setCategorySearch] = useState('');
  const [savedId, setSavedId] = useState<string | null>(null); const [pendingNavigation, setPendingNavigation] = useState<NavigationAction | null>(null);
  const errors = validateItemDraft(form); const isDirty = hasItemFormChanged(form, initial);
  const filteredCategories = useMemo(() => categories.filter((category) => category.isActive !== false && category.name.toLowerCase().includes(categorySearch.toLowerCase())), [categories, categorySearch]);
  const categoryName = categories.find((category) => category.id === form.categoryId)?.name;

  useEffect(() => { let active = true; Promise.all([itemService.fetchCategories(), itemId ? itemService.fetchItemById(itemId) : Promise.resolve(null)])
    .then(([nextCategories, item]) => { if (!active) return; setCategories(nextCategories); if (item) { const loaded = itemDraftFromRecord(item); setInitial(loaded); setForm(loaded); } setLoadError(null); })
    .catch((error) => active && setLoadError(error instanceof Error ? error.message : 'Item could not be loaded.')).finally(() => active && setLoading(false));
    return () => { active = false; }; }, [itemId]);
  useEffect(() => { if (!pendingNavigation || isDirty) return; navigation.dispatch(pendingNavigation); setPendingNavigation(null); }, [isDirty, navigation, pendingNavigation]);
  useEffect(() => { if (savedId && !isDirty) navigation.replace('ItemDetail', { itemId: savedId }); }, [isDirty, navigation, savedId]);
  usePreventRemove(isDirty && !saving, ({ data }) => Alert.alert('Discard item changes?', 'Your unsaved changes will be lost.', [{ text: 'Keep editing', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: () => { setForm(initial); setPendingNavigation(data.action); } }]));

  const save = async () => { setSubmitted(true); if (Object.keys(errors).length) return; setSaving(true); setSaveError(null);
    try { const saved = itemId ? await itemService.updateItem(itemId, itemPayloadFromDraft(form)) : await itemService.createItem(itemPayloadFromDraft(form)); setInitial(form); setSavedId(saved.id); successHaptic(); }
    catch (error) { errorHaptic(); setSaveError(error instanceof Error ? error.message : 'Item could not be saved.'); }
    finally { setSaving(false); } };
  if (loading) return <View style={[styles.center, { backgroundColor: theme.colors.background }]}><ActivityIndicator color={theme.colors.accent} accessibilityLabel="Loading item" /></View>;
  if (loadError) return <View style={[styles.center, { backgroundColor: theme.colors.background }]}><EmptyState title="Couldn’t load this item" description={loadError} actionLabel="Go back" onAction={() => navigation.goBack()} /></View>;
  return <KeyboardAvoidingView style={[styles.container, { backgroundColor: theme.colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
    <ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <ModernInput label="Item name" value={form.name} onChangeText={(name) => setForm({ ...form, name })} autoCapitalize="words" error={submitted ? errors.name : undefined} />
      <ModernInput label="Description (optional)" value={form.description} onChangeText={(description) => setForm({ ...form, description })} multiline />
      <Text style={[theme.type.section, styles.label]}>TYPE</Text><View style={styles.types}>{(['product', 'service'] as const).map((type) => <Pressable key={type} accessibilityRole="button" accessibilityState={{ selected: form.type === type }} onPress={() => setForm({ ...form, type })} style={[styles.type, { backgroundColor: form.type === type ? theme.colors.accent : theme.colors.fill }]}><Text style={[theme.type.callout, { color: form.type === type ? theme.colors.accentForeground : theme.colors.text }]}>{type === 'product' ? 'Product' : 'Service'}</Text></Pressable>)}</View>
      <View style={[styles.selector, { backgroundColor: theme.colors.surface }]}><ListRow label="Category" value={categoryName} placeholder="Uncategorised" onPress={() => setCategoryOpen(true)} /></View>
      <ModernInput label="Unit" value={form.unit} onChangeText={(unit) => setForm({ ...form, unit })} autoCapitalize="none" error={submitted ? errors.unit : undefined} />
      <FormSwitch label="Sales item" value={form.enableSaleInfo} onValueChange={(enableSaleInfo) => setForm({ ...form, enableSaleInfo })} description="Available when creating invoices." />
      {form.enableSaleInfo ? <ModernInput label="Sale price" value={form.salePrice} onChangeText={(salePrice) => setForm({ ...form, salePrice })} keyboardType="decimal-pad" error={submitted ? errors.salePrice : undefined} /> : null}
      <FormSwitch label="Purchase item" value={form.enablePurchaseInfo} onValueChange={(enablePurchaseInfo) => setForm({ ...form, enablePurchaseInfo })} description="Records an optional purchase price." />
      {form.enablePurchaseInfo ? <ModernInput label="Purchase price" value={form.purchasePrice} onChangeText={(purchasePrice) => setForm({ ...form, purchasePrice })} keyboardType="decimal-pad" error={submitted ? errors.purchasePrice : undefined} /> : null}
      <ModernInput label="Tax rate % (optional)" value={form.taxRate} onChangeText={(taxRate) => setForm({ ...form, taxRate })} keyboardType="decimal-pad" error={submitted ? errors.taxRate : undefined} />
      <FormSwitch label="Active" value={form.isActive} onValueChange={(isActive) => setForm({ ...form, isActive })} description="Inactive items remain in history but are hidden from invoice selection." />
      {saveError ? <Text style={[theme.type.subhead, { color: theme.colors.danger, marginBottom: space.md }]} accessibilityLiveRegion="assertive">{saveError}</Text> : null}
      <ModernButton onPress={save} loading={saving} fullWidth size="lg">{itemId ? 'Save changes' : 'Create item'}</ModernButton>
    </ScrollView>
    <SelectionSheet visible={categoryOpen} title="Choose category" searchPlaceholder="Search categories" searchQuery={categorySearch} onSearchChange={setCategorySearch} onClose={() => setCategoryOpen(false)} loading={false} empty={!filteredCategories.length} emptyTitle="No categories found">
      <SelectionRow title="Uncategorised" selected={!form.categoryId} onPress={() => { setForm({ ...form, categoryId: '' }); setCategoryOpen(false); }} />
      {filteredCategories.map((category) => <SelectionRow key={category.id} title={category.name} selected={form.categoryId === category.id} onPress={() => { setForm({ ...form, categoryId: category.id }); setCategoryOpen(false); }} />)}
    </SelectionSheet>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({ container: { flex: 1 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, content: { padding: space.screen, paddingBottom: 48 }, label: { marginBottom: space.sm, marginLeft: space.xs }, types: { flexDirection: 'row', gap: space.sm, marginBottom: space.xl }, type: { flex: 1, minHeight: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center' }, selector: { borderRadius: 20, overflow: 'hidden', marginBottom: space.lg } });
