import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { itemService, Item, ItemCategory } from '@/services/itemService';
import { Feather } from '@expo/vector-icons';
import { FormInput } from '../ui/FormInput';
import { FormSwitch } from '../ui/FormSwitch';
import { ActionButton } from '../ui/ActionButton';
import { useTheme } from '@/theme';
import { control, radius, space } from '@/theme/tokens';

interface ItemPickerProps {
  visible: boolean;
  onSelect: (item: Item) => void;
  onClose: () => void;
  selectedItemId?: string;
}

export function ItemPicker({
  visible,
  onSelect,
  onClose,
  selectedItemId,
}: ItemPickerProps) {
  const theme = useTheme();
  const { colors: palette } = theme;
  const styles = createStyles(theme);
  const [items, setItems] = useState<Item[]>([]);
  const [filteredItems, setFilteredItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<ItemCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<'all' | 'product' | 'service'>('all');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Form state
  const [newItem, setNewItem] = useState({
    name: '',
    description: '',
    type: 'product' as 'product' | 'service',
    categoryId: '',
    salePrice: '',
    purchasePrice: '',
    taxRate: '',
    enableSaleInfo: true,
    enablePurchaseInfo: false,
    unit: 'unit',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (visible) {
      loadData();
      setSearchQuery('');
      setSelectedType('all');
      setShowCreateForm(false);
    }
  }, [visible]);

  useEffect(() => {
    let filtered = items;

    // Filter by search query
    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.name.toLowerCase().includes(query) ||
          item.description?.toLowerCase().includes(query) ||
          item.category?.name.toLowerCase().includes(query)
      );
    }

    // Filter by type
    if (selectedType !== 'all') {
      filtered = filtered.filter((item) => item.type === selectedType);
    }

    setFilteredItems(filtered);
  }, [searchQuery, selectedType, items]);

  const loadData = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const [itemsData, categoriesData] = await Promise.all([
        itemService.fetchItems(),
        itemService.fetchCategories(),
      ]);
      setItems(itemsData);
      setFilteredItems(itemsData);
      setCategories(categoriesData);
    } catch (error) {
      console.error('Error loading items:', error);
      setLoadError('Items could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateItem = async () => {
    // Validate
    const newErrors: Record<string, string> = {};
    if (!newItem.name.trim()) {
      newErrors.name = 'Name is required';
    }
    if (newItem.enableSaleInfo && !newItem.salePrice) {
      newErrors.salePrice = 'Sale price is required';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      setCreating(true);
      const item = await itemService.createItem({
        name: newItem.name,
        description: newItem.description || null,
        type: newItem.type,
        categoryId: newItem.categoryId || null,
        salePrice: newItem.salePrice ? parseFloat(newItem.salePrice) : null,
        purchasePrice: newItem.purchasePrice ? parseFloat(newItem.purchasePrice) : null,
        taxRate: newItem.taxRate ? parseFloat(newItem.taxRate) : null,
        enableSaleInfo: newItem.enableSaleInfo,
        enablePurchaseInfo: newItem.enablePurchaseInfo,
        unit: newItem.unit,
      });
      onSelect(item);
      onClose();
      // Reset form
      setNewItem({
        name: '',
        description: '',
        type: 'product',
        categoryId: '',
        salePrice: '',
        purchasePrice: '',
        taxRate: '',
        enableSaleInfo: true,
        enablePurchaseInfo: false,
        unit: 'unit',
      });
      setErrors({});
      setShowCreateForm(false);
    } catch (error) {
      console.error('Error creating item:', error);
      setErrors({ name: 'Could not create this item. Try again.' });
    } finally {
      setCreating(false);
    }
  };

  const formatPrice = (price?: number | null) => {
    if (price === null || price === undefined) return 'N/A';
    return `$${price.toFixed(2)}`;
  };

  const getItemIcon = (type: string): keyof typeof Feather.glyphMap => {
    return type === 'product' ? 'box' : 'settings';
  };

  if (!visible) return null;

  const typeFilters: Array<{ id: 'all' | 'product' | 'service'; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'product', label: 'Products' },
    { id: 'service', label: 'Services' },
  ];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.header}>
            <View style={styles.headerRow}>
              <Text style={styles.title}>{showCreateForm ? 'New item' : 'Select item'}</Text>
              <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Done" style={styles.done}>
                <Text style={styles.doneLabel}>Done</Text>
              </Pressable>
            </View>
            {!showCreateForm ? (
              <>
                <View style={styles.search}>
                  <Feather name="search" size={16} color={palette.textTertiary} />
                  <TextInput
                    placeholder="Search items"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    style={styles.searchInput}
                    placeholderTextColor={palette.textTertiary}
                    accessibilityLabel="Search items"
                  />
                </View>
                <View style={styles.filters}>
                  {typeFilters.map((filter) => {
                    const active = selectedType === filter.id;
                    return (
                      <Pressable
                        key={filter.id}
                        onPress={() => setSelectedType(filter.id)}
                        accessibilityRole="button"
                        accessibilityLabel={filter.label}
                        accessibilityState={{ selected: active }}
                        style={[styles.filter, active && styles.filterActive]}
                      >
                        <Text style={[styles.filterLabel, active && styles.filterLabelActive]}>{filter.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}
          </View>

          <ScrollView style={styles.flex} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            {showCreateForm ? (
              <View>
                <View style={styles.formCard}>
                  <FormInput
                    label="Item Name"
                    value={newItem.name}
                    onChangeText={(text) => {
                      setNewItem({ ...newItem, name: text });
                      setErrors({ ...errors, name: '' });
                    }}
                    error={errors.name}
                    placeholder="Enter item name"
                    required
                  />
                  <FormInput
                    label="Description"
                    value={newItem.description}
                    onChangeText={(text) => setNewItem({ ...newItem, description: text })}
                    placeholder="Item description (optional)"
                  />
                  <Text style={styles.fieldLabel}>Type</Text>
                  <View style={styles.typeRow}>
                    {(['product', 'service'] as const).map((type) => {
                      const active = newItem.type === type;
                      return (
                        <Pressable
                          key={type}
                          onPress={() => setNewItem({ ...newItem, type })}
                          accessibilityRole="button"
                          accessibilityLabel={type}
                          accessibilityState={{ selected: active }}
                          style={[styles.typeButton, active && styles.typeButtonActive]}
                        >
                          <Text style={[styles.typeLabel, active && styles.typeLabelActive]}>{type === 'product' ? 'Product' : 'Service'}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <FormSwitch
                    label="Enable Sale Information"
                    value={newItem.enableSaleInfo}
                    onValueChange={(value) => setNewItem({ ...newItem, enableSaleInfo: value })}
                  />
                  {newItem.enableSaleInfo ? (
                    <FormInput
                      label="Sale Price"
                      value={newItem.salePrice}
                      onChangeText={(text) => {
                        setNewItem({ ...newItem, salePrice: text });
                        setErrors({ ...errors, salePrice: '' });
                      }}
                      error={errors.salePrice}
                      placeholder="0.00"
                      keyboardType="decimal-pad"
                      required
                    />
                  ) : null}
                  <FormInput
                    label="Unit"
                    value={newItem.unit}
                    onChangeText={(text) => setNewItem({ ...newItem, unit: text })}
                    placeholder="unit, hour, kg, etc."
                  />
                </View>
                <View style={styles.formActions}>
                  <View style={styles.flex}>
                    <ActionButton
                      title="Cancel"
                      variant="secondary"
                      onPress={() => {
                        setShowCreateForm(false);
                        setNewItem({
                          name: '',
                          description: '',
                          type: 'product',
                          categoryId: '',
                          salePrice: '',
                          purchasePrice: '',
                          taxRate: '',
                          enableSaleInfo: true,
                          enablePurchaseInfo: false,
                          unit: 'unit',
                        });
                        setErrors({});
                      }}
                    />
                  </View>
                  <View style={styles.flex}>
                    <ActionButton title="Create" variant="primary" onPress={handleCreateItem} loading={creating} />
                  </View>
                </View>
              </View>
            ) : (
              <View>
                <Pressable onPress={() => setShowCreateForm(true)} accessibilityRole="button" accessibilityLabel="Create new item" style={styles.createButton}>
                  <Text style={styles.createLabel}>Create new item</Text>
                </Pressable>
                {loading ? (
                  <ActivityIndicator size="large" color={palette.accent} accessibilityLabel="Loading items" style={styles.loader} />
                ) : loadError ? (
                  <View style={styles.empty}>
                    <Text style={styles.emptyTitle}>{loadError}</Text>
                    <Pressable onPress={loadData} accessibilityRole="button" accessibilityLabel="Try again" style={styles.retry}>
                      <Text style={styles.retryLabel}>Try again</Text>
                    </Pressable>
                  </View>
                ) : filteredItems.length === 0 ? (
                  <View style={styles.empty}>
                    <Text style={styles.emptyTitle}>{searchQuery || selectedType !== 'all' ? 'No items found' : 'No items yet'}</Text>
                    {!searchQuery && selectedType === 'all' ? <Text style={styles.emptyBody}>Create your first item to get started</Text> : null}
                  </View>
                ) : (
                  <View style={styles.list}>
                    {filteredItems.map((item) => {
                      const selected = selectedItemId === item.id;
                      return (
                        <Pressable
                          key={item.id}
                          onPress={() => {
                            onSelect(item);
                            onClose();
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={item.name}
                          accessibilityState={{ selected }}
                          style={[styles.row, selected && styles.rowSelected]}
                        >
                          <View style={styles.itemIcon}>
                            <Feather name={getItemIcon(item.type)} size={18} color={palette.accentText} />
                          </View>
                          <View style={styles.flex}>
                            <Text style={styles.name}>{item.name}</Text>
                            <View style={styles.metaRow}>
                              <Text style={styles.price}>{formatPrice(item.salePrice)}</Text>
                              {item.category ? (
                                <View style={styles.category}>
                                  <View style={[styles.categoryDot, { backgroundColor: item.category.color || palette.accent }]} />
                                  <Text style={styles.categoryName}>{item.category.name}</Text>
                                </View>
                              ) : null}
                            </View>
                            {item.description ? <Text style={styles.description} numberOfLines={1}>{item.description}</Text> : null}
                          </View>
                          {selected ? (
                            <View style={styles.check}>
                              <Feather name="check" size={14} color={palette.accentForeground} />
                            </View>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const createStyles = ({ colors: palette, type }: ReturnType<typeof useTheme>) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.background },
  flex: { flex: 1 },
  header: {
    backgroundColor: palette.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.separator,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.md,
    gap: space.md,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...type.headline, fontSize: 20 },
  done: { minHeight: control.touchTarget, minWidth: control.touchTarget, alignItems: 'flex-end', justifyContent: 'center' },
  doneLabel: { color: palette.accentText, fontWeight: '700', fontSize: 17 },
  search: {
    minHeight: control.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.fill,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    gap: space.sm,
  },
  searchInput: { flex: 1, color: palette.text, fontSize: 16, minHeight: control.touchTarget },
  filters: { flexDirection: 'row', gap: space.sm },
  filter: {
    flex: 1,
    minHeight: control.touchTarget,
    borderRadius: radius.pill,
    backgroundColor: palette.fill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
  },
  filterActive: { backgroundColor: palette.accent },
  filterLabel: { color: palette.text, fontWeight: '700', fontSize: 14 },
  filterLabelActive: { color: palette.accentForeground },
  content: { padding: space.lg, paddingBottom: 32 },
  formCard: { backgroundColor: palette.surface, borderRadius: radius.group, padding: space.lg, marginBottom: space.lg },
  fieldLabel: { ...type.footnote, color: palette.text, fontWeight: '600', marginBottom: space.sm },
  typeRow: { flexDirection: 'row', gap: space.md, marginBottom: space.lg },
  typeButton: {
    flex: 1,
    minHeight: control.touchTarget,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeButtonActive: { borderColor: palette.accent, backgroundColor: palette.accentFill },
  typeLabel: { color: palette.text, fontWeight: '700' },
  typeLabelActive: { color: palette.accentText },
  formActions: { flexDirection: 'row', gap: space.md, marginBottom: space.lg },
  createButton: {
    minHeight: control.default,
    backgroundColor: palette.accent,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.lg,
    paddingHorizontal: space.lg,
  },
  createLabel: { color: palette.accentForeground, fontWeight: '700', fontSize: 16 },
  loader: { marginTop: 48 },
  empty: { alignItems: 'center', paddingVertical: 48 },
  emptyTitle: { ...type.callout, textAlign: 'center', marginBottom: space.sm },
  emptyBody: { ...type.subhead, textAlign: 'center' },
  retry: { minHeight: control.touchTarget, justifyContent: 'center', paddingHorizontal: space.lg },
  retryLabel: { color: palette.accentText, fontWeight: '700', fontSize: 16 },
  list: { gap: space.sm },
  row: {
    minHeight: 64,
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    padding: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: palette.border,
    gap: space.md,
  },
  rowSelected: { borderWidth: 2, borderColor: palette.accent },
  itemIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: palette.accentFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { ...type.callout, marginBottom: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  price: { color: palette.accentText, fontWeight: '700', fontSize: 14 },
  category: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  categoryDot: { width: 8, height: 8, borderRadius: 4 },
  categoryName: { ...type.footnote },
  description: { ...type.footnote, marginTop: 2 },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
