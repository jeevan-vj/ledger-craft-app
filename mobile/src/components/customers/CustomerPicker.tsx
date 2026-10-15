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
import { customerService, Customer } from '@/services/customerService';
import { Feather } from '@expo/vector-icons';
import { FormInput } from '../ui/FormInput';
import { ActionButton } from '../ui/ActionButton';

interface CustomerPickerProps {
  visible: boolean;
  onSelect: (customer: Customer) => void;
  onClose: () => void;
  selectedCustomerId?: string;
}

export function CustomerPicker({
  visible,
  onSelect,
  onClose,
  selectedCustomerId,
}: CustomerPickerProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);

  // Form state
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    country: 'New Zealand',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (visible) {
      loadCustomers();
      setSearchQuery('');
      setShowCreateForm(false);
    }
  }, [visible]);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredCustomers(customers);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredCustomers(
        customers.filter(
          (c) =>
            c.name.toLowerCase().includes(query) ||
            c.email?.toLowerCase().includes(query) ||
            c.phone?.toLowerCase().includes(query)
        )
      );
    }
  }, [searchQuery, customers]);

  const loadCustomers = async () => {
    try {
      setLoading(true);
      const data = await customerService.fetchCustomers();
      setCustomers(data);
      setFilteredCustomers(data);
    } catch (error) {
      console.error('Error loading customers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCustomer = async () => {
    // Validate
    const newErrors: Record<string, string> = {};
    if (!newCustomer.name.trim()) {
      newErrors.name = 'Name is required';
    }
    if (newCustomer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newCustomer.email)) {
      newErrors.email = 'Invalid email format';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      setCreating(true);
      const customer = await customerService.createCustomer(newCustomer);
      onSelect(customer);
      onClose();
      // Reset form
      setNewCustomer({
        name: '',
        email: '',
        phone: '',
        address: '',
        city: '',
        country: 'New Zealand',
      });
      setErrors({});
      setShowCreateForm(false);
    } catch (error) {
      console.error('Error creating customer:', error);
      alert('Failed to create customer');
    } finally {
      setCreating(false);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView className="flex-1 bg-gray-50">
        {/* Header */}
        <View className="bg-white border-b border-gray-200 px-4 py-3">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-xl font-bold">
              {showCreateForm ? 'New Customer' : 'Select Customer'}
            </Text>
            <TouchableOpacity onPress={onClose} className="p-2">
              <Text className="text-lime-700 font-semibold">Done</Text>
            </TouchableOpacity>
          </View>

          {!showCreateForm && (
            <View className="flex-row items-center bg-gray-100 rounded-xl px-4 py-2">
              <Feather name="search" size={16} color="#94A3B8" />
              <TextInput
                placeholder="Search customers..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                className="flex-1 text-base"
                placeholderTextColor="#9CA3AF"
              />
            </View>
          )}
        </View>

        {/* Content */}
        <ScrollView className="flex-1">
          {showCreateForm ? (
            // Create Form
            <View className="p-4">
              <View className="bg-white rounded-2xl p-4 mb-4">
                <FormInput
                  label="Customer Name"
                  value={newCustomer.name}
                  onChangeText={(text) => {
                    setNewCustomer({ ...newCustomer, name: text });
                    setErrors({ ...errors, name: '' });
                  }}
                  error={errors.name}
                  placeholder="Enter customer name"
                  required
                />

                <FormInput
                  label="Email"
                  value={newCustomer.email}
                  onChangeText={(text) => {
                    setNewCustomer({ ...newCustomer, email: text });
                    setErrors({ ...errors, email: '' });
                  }}
                  error={errors.email}
                  placeholder="email@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />

                <FormInput
                  label="Phone"
                  value={newCustomer.phone}
                  onChangeText={(text) =>
                    setNewCustomer({ ...newCustomer, phone: text })
                  }
                  placeholder="+64 21 123 4567"
                  keyboardType="phone-pad"
                />

                <FormInput
                  label="Address"
                  value={newCustomer.address}
                  onChangeText={(text) =>
                    setNewCustomer({ ...newCustomer, address: text })
                  }
                  placeholder="Street address"
                />

                <FormInput
                  label="City"
                  value={newCustomer.city}
                  onChangeText={(text) =>
                    setNewCustomer({ ...newCustomer, city: text })
                  }
                  placeholder="City"
                />

                <FormInput
                  label="Country"
                  value={newCustomer.country}
                  onChangeText={(text) =>
                    setNewCustomer({ ...newCustomer, country: text })
                  }
                  placeholder="New Zealand"
                />
              </View>

              <View className="flex-row gap-3 mb-4">
                <View className="flex-1">
                  <ActionButton
                    title="Cancel"
                    variant="secondary"
                    onPress={() => {
                      setShowCreateForm(false);
                      setNewCustomer({
                        name: '',
                        email: '',
                        phone: '',
                        address: '',
                        city: '',
                        country: 'New Zealand',
                      });
                      setErrors({});
                    }}
                  />
                </View>
                <View className="flex-1">
                  <ActionButton
                    title="Create"
                    variant="primary"
                    onPress={handleCreateCustomer}
                    loading={creating}
                  />
                </View>
              </View>
            </View>
          ) : (
            // Customer List
            <View className="p-4">
              {/* Create New Button */}
              <TouchableOpacity
                onPress={() => setShowCreateForm(true)}
                className="bg-lime-700 rounded-xl p-4 mb-4 flex-row items-center justify-center"
                activeOpacity={0.7}
              >
                <Text className="text-white text-lg mr-2">+</Text>
                <Text className="text-white font-semibold text-base">
                  Create New Customer
                </Text>
              </TouchableOpacity>

              {loading ? (
                <View className="py-12 items-center">
                  <ActivityIndicator size="large" color="#163300" />
                </View>
              ) : filteredCustomers.length === 0 ? (
                <View className="py-12 items-center">
                  <Text className="text-gray-500 text-center mb-2">
                    {searchQuery
                      ? 'No customers found'
                      : 'No customers yet'}
                  </Text>
                  {!searchQuery && (
                    <Text className="text-sm text-gray-400 text-center">
                      Create your first customer to get started
                    </Text>
                  )}
                </View>
              ) : (
                <View className="gap-2">
                  {filteredCustomers.map((customer) => (
                    <TouchableOpacity
                      key={customer.id}
                      onPress={() => {
                        onSelect(customer);
                        onClose();
                      }}
                      className={`bg-white rounded-xl p-4 flex-row items-center ${
                        selectedCustomerId === customer.id
                          ? 'border-2 border-lime-700'
                          : 'border border-gray-200'
                      }`}
                      activeOpacity={0.7}
                    >
                      {/* Avatar */}
                      <View className="bg-lime-100 w-12 h-12 rounded-full items-center justify-center mr-3">
                        <Text className="text-revolut-blue-700 font-bold">
                          {getInitials(customer.name)}
                        </Text>
                      </View>

                      {/* Info */}
                      <View className="flex-1">
                        <Text className="font-semibold text-gray-900 mb-0.5">
                          {customer.name}
                        </Text>
                        {customer.email && (
                          <Text className="text-sm text-gray-500">
                            {customer.email}
                          </Text>
                        )}
                        {customer.city && (
                          <Text className="text-xs text-gray-400 mt-0.5">
                            {customer.city}
                            {customer.country && `, ${customer.country}`}
                          </Text>
                        )}
                      </View>

                      {/* Check mark if selected */}
                      {selectedCustomerId === customer.id && (
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

