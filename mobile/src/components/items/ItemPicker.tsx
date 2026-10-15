import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { itemService, Item, ItemCategory } from '@/services/itemService';
import { Feather } from '@expo/vector-icons';
import { FormInput } from '../ui/FormInput';
import { FormSwitch } from '../ui/FormSwitch';
import { ActionButton } from '../ui/ActionButton';

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
  const [items, setItems] = useState<Item[]>([]);
  const [filteredItems, setFilteredItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<ItemCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<'all' | 'product' | 'service'>('all');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);

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
      const [itemsData, categoriesData] = await Promise.all([
        itemService.fetchItems(),
        itemService.fetchCategories(),
      ]);
      setItems(itemsData);
      setFilteredItems(itemsData);
      setCategories(categoriesData);
    } catch (error) {
      console.error('Error loading items:', error);
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
      alert('Failed to create item');
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

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView className="flex-1 bg-gray-50">
        {/* Header */}
        <View className="bg-white border-b border-gray-200 px-4 py-3">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-xl font-bold">
              {showCreateForm ? 'New Item' : 'Select Item'}
            </Text>
            <TouchableOpacity onPress={onClose} className="p-2">
              <Text className="text-lime-700 font-semibold">Done</Text>
            </TouchableOpacity>
          </View>

          {!showCreateForm && (
            <>
              {/* Search */}
              <View className="flex-row items-center bg-gray-100 rounded-xl px-4 py-2 mb-3">
                <Feather name="search" size={16} color="#94A3B8" />
                <TextInput
                  placeholder="Search items..."
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  className="flex-1 text-base"
                  placeholderTextColor="#9CA3AF"
                />
              </View>

              {/* Type Filter */}
              <View className="flex-row gap-2">
                <TouchableOpacity
                  onPress={() => setSelectedType('all')}
                  className={`flex-1 py-2 rounded-lg ${
                    selectedType === 'all' ? 'bg-lime-700' : 'bg-gray-200'
                  }`}
                >
                  <Text
                    className={`text-center font-semibold ${
                      selectedType === 'all' ? 'text-white' : 'text-gray-700'
                    }`}
                  >
                    All
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setSelectedType('product')}
                  className={`flex-1 py-2 rounded-lg ${
                    selectedType === 'product' ? 'bg-lime-700' : 'bg-gray-200'
                  }`}
                >
                  <Text
                    className={`text-center font-semibold ${
                      selectedType === 'product' ? 'text-white' : 'text-gray-700'
                    }`}
                  >
                    Products
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setSelectedType('service')}
                  className={`flex-1 py-2 rounded-lg ${
                    selectedType === 'service' ? 'bg-lime-700' : 'bg-gray-200'
                  }`}
                >
                  <Text
                    className={`text-center font-semibold ${
                      selectedType === 'service' ? 'text-white' : 'text-gray-700'
                    }`}
                  >
                    Services
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        {/* Content */}
        <ScrollView className="flex-1">
          {showCreateForm ? (
            // Create Form
            <View className="p-4">
              <View className="bg-white rounded-2xl p-4 mb-4">
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

                {/* Type Selection */}
                <View className="mb-4">
                  <Text className="text-sm font-medium text-gray-700 mb-2">Type *</Text>
                  <View className="flex-row gap-3">
                    <TouchableOpacity
                      onPress={() => setNewItem({ ...newItem, type: 'product' })}
                      className={`flex-1 py-3 rounded-xl border-2 ${
                        newItem.type === 'product'
                          ? 'border-lime-700 bg-lime-50'
                          : 'border-gray-300 bg-white'
                      }`}
                    >
                      <Text className="text-center font-semibold">Product</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setNewItem({ ...newItem, type: 'service' })}
                      className={`flex-1 py-3 rounded-xl border-2 ${
                        newItem.type === 'service'
                          ? 'border-lime-700 bg-lime-50'
                          : 'border-gray-300 bg-white'
                      }`}
                    >
                      <Text className="text-center font-semibold">Service</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <FormSwitch
                  label="Enable Sale Information"
                  value={newItem.enableSaleInfo}
                  onValueChange={(value) =>
                    setNewItem({ ...newItem, enableSaleInfo: value })
                  }
                />

                {newItem.enableSaleInfo && (
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
                )}

                <FormInput
                  label="Unit"
                  value={newItem.unit}
                  onChangeText={(text) => setNewItem({ ...newItem, unit: text })}
                  placeholder="unit, hour, kg, etc."
                />
              </View>

              <View className="flex-row gap-3 mb-4">
                <View className="flex-1">
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
                <View className="flex-1">
                  <ActionButton
                    title="Create"
                    variant="primary"
                    onPress={handleCreateItem}
                    loading={creating}
                  />
                </View>
              </View>
            </View>
          ) : (
            // Item List
            <View className="p-4">
              {/* Create New Button */}
              <TouchableOpacity
                onPress={() => setShowCreateForm(true)}
                className="bg-lime-700 rounded-xl p-4 mb-4 flex-row items-center justify-center"
                activeOpacity={0.7}
              >
                <Text className="text-white text-lg mr-2">+</Text>
                <Text className="text-white font-semibold text-base">
                  Create New Item
                </Text>
              </TouchableOpacity>

              {loading ? (
                <View className="py-12 items-center">
                  <ActivityIndicator size="large" color="#163300" />
                </View>
              ) : filteredItems.length === 0 ? (
                <View className="py-12 items-center">
                  <Text className="text-gray-500 text-center mb-2">
                    {searchQuery || selectedType !== 'all'
                      ? 'No items found'
                      : 'No items yet'}
                  </Text>
                  {!searchQuery && selectedType === 'all' && (
                    <Text className="text-sm text-gray-400 text-center">
                      Create your first item to get started
                    </Text>
                  )}
                </View>
              ) : (
                <View className="gap-2">
                  {filteredItems.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      onPress={() => {
                        onSelect(item);
                        onClose();
                      }}
                      className={`bg-white rounded-xl p-4 flex-row items-center ${
                        selectedItemId === item.id
                          ? 'border-2 border-lime-700'
                          : 'border border-gray-200'
                      }`}
                      activeOpacity={0.7}
                    >
                      {/* Icon */}
                      <View className="bg-gray-100 w-12 h-12 rounded-xl items-center justify-center mr-3">
                        <Feather name={getItemIcon(item.type)} size={20} color="#163300" />
                      </View>

                      {/* Info */}
                      <View className="flex-1">
                        <Text className="font-semibold text-gray-900 mb-0.5">
                          {item.name}
                        </Text>
                        <View className="flex-row items-center gap-2">
                          <Text className="text-sm font-bold text-revolut-blue-700">
                            {formatPrice(item.salePrice)}
                          </Text>
                          {item.category && (
                            <View
                              className="px-2 py-0.5 rounded"
                              style={{ backgroundColor: item.category.color || '#E5E7EB' }}
                            >
                              <Text className="text-xs font-medium text-gray-700">
                                {item.category.name}
                              </Text>
                            </View>
                          )}
                        </View>
                        {item.description && (
                          <Text className="text-xs text-gray-400 mt-0.5" numberOfLines={1}>
                            {item.description}
                          </Text>
                        )}
                      </View>

                      {/* Check mark if selected */}
                      {selectedItemId === item.id && (
                        <View className="bg-lime-700 w-6 h-6 rounded-full items-center justify-center">
                          <Feather name="check" size={12} color="#FFFFFF" />
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

