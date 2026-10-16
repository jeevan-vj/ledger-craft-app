import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { customerService, Customer } from '@/services/customerService';
import { Feather } from '@expo/vector-icons';
import { FormInput } from '../ui/FormInput';
import { ActionButton } from '../ui/ActionButton';
import { useTheme } from '@/theme';
import { control, radius, space } from '@/theme/tokens';

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
  const theme = useTheme();
  const { colors: palette } = theme;
  const styles = createStyles(theme);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

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
      setLoadError(null);
      const data = await customerService.fetchCustomers();
      setCustomers(data);
      setFilteredCustomers(data);
    } catch (error) {
      console.error('Error loading customers:', error);
      setLoadError('Customers could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setNewCustomer({
      name: '',
      email: '',
      phone: '',
      address: '',
      city: '',
      country: 'New Zealand',
    });
    setErrors({});
  };

  const handleCreateCustomer = async () => {
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
      const customer = await customerService.createCustomer({
        name: newCustomer.name.trim(),
        email: newCustomer.email.trim(),
        phone: newCustomer.phone.trim() || null,
        address: newCustomer.address.trim() || null,
        city: newCustomer.city.trim() || null,
        state: null,
        zip: null,
        country: newCustomer.country.trim() || 'New Zealand',
      });
      onSelect(customer);
      onClose();
      resetForm();
      setShowCreateForm(false);
    } catch (error) {
      console.error('Error creating customer:', error);
      setErrors({ name: 'Could not create this customer. Try again.' });
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
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.header}>
            <View style={styles.headerRow}>
              <Text style={styles.title}>{showCreateForm ? 'New customer' : 'Select customer'}</Text>
              <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Done" style={styles.done}>
                <Text style={styles.doneLabel}>Done</Text>
              </Pressable>
            </View>

            {!showCreateForm && (
              <View style={styles.search}>
                <Feather name="search" size={16} color={palette.textTertiary} />
                <TextInput
                  placeholder="Search customers"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  style={styles.searchInput}
                  placeholderTextColor={palette.textTertiary}
                  accessibilityLabel="Search customers"
                />
              </View>
            )}
          </View>

          <ScrollView style={styles.flex} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            {showCreateForm ? (
              <View>
                <View style={styles.formCard}>
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
                    onChangeText={(text) => setNewCustomer({ ...newCustomer, phone: text })}
                    placeholder="+64 21 123 4567"
                    keyboardType="phone-pad"
                  />
                  <FormInput
                    label="Address"
                    value={newCustomer.address}
                    onChangeText={(text) => setNewCustomer({ ...newCustomer, address: text })}
                    placeholder="Street address"
                  />
                  <FormInput
                    label="City"
                    value={newCustomer.city}
                    onChangeText={(text) => setNewCustomer({ ...newCustomer, city: text })}
                    placeholder="City"
                  />
                  <FormInput
                    label="Country"
                    value={newCustomer.country}
                    onChangeText={(text) => setNewCustomer({ ...newCustomer, country: text })}
                    placeholder="New Zealand"
                  />
                </View>
                <View style={styles.formActions}>
                  <View style={styles.flex}>
                    <ActionButton
                      title="Cancel"
                      variant="secondary"
                      onPress={() => {
                        setShowCreateForm(false);
                        resetForm();
                      }}
                    />
                  </View>
                  <View style={styles.flex}>
                    <ActionButton title="Create" variant="primary" onPress={handleCreateCustomer} loading={creating} />
                  </View>
                </View>
              </View>
            ) : (
              <View>
                <Pressable
                  onPress={() => setShowCreateForm(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Create new customer"
                  style={styles.createButton}
                >
                  <Text style={styles.createLabel}>Create new customer</Text>
                </Pressable>

                {loading ? (
                  <ActivityIndicator size="large" color={palette.accent} accessibilityLabel="Loading customers" style={styles.loader} />
                ) : loadError ? (
                  <View style={styles.empty}>
                    <Text style={styles.emptyTitle}>{loadError}</Text>
                    <Pressable onPress={loadCustomers} accessibilityRole="button" accessibilityLabel="Try again" style={styles.retry}>
                      <Text style={styles.retryLabel}>Try again</Text>
                    </Pressable>
                  </View>
                ) : filteredCustomers.length === 0 ? (
                  <View style={styles.empty}>
                    <Text style={styles.emptyTitle}>{searchQuery ? 'No customers found' : 'No customers yet'}</Text>
                    {!searchQuery ? <Text style={styles.emptyBody}>Create your first customer to get started</Text> : null}
                  </View>
                ) : (
                  <View style={styles.list}>
                    {filteredCustomers.map((customer) => {
                      const selected = selectedCustomerId === customer.id;
                      return (
                        <Pressable
                          key={customer.id}
                          onPress={() => {
                            onSelect(customer);
                            onClose();
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={customer.name}
                          accessibilityState={{ selected }}
                          style={[styles.row, selected && styles.rowSelected]}
                        >
                          <View style={styles.avatar}>
                            <Text style={styles.avatarText}>{getInitials(customer.name)}</Text>
                          </View>
                          <View style={styles.flex}>
                            <Text style={styles.name}>{customer.name}</Text>
                            {customer.email ? <Text style={styles.meta}>{customer.email}</Text> : null}
                            {customer.city ? (
                              <Text style={styles.meta}>
                                {customer.city}
                                {customer.country ? `, ${customer.country}` : ''}
                              </Text>
                            ) : null}
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
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.md },
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
  content: { padding: space.lg, paddingBottom: 32 },
  formCard: { backgroundColor: palette.surface, borderRadius: radius.group, padding: space.lg, marginBottom: space.lg },
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
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.accentFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: palette.accentText, fontWeight: '800' },
  name: { ...type.callout, marginBottom: 2 },
  meta: { ...type.footnote },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
