import React, { useState, useCallback, useLayoutEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { ExpenseStackParamList } from '@/navigation/types';
import { NativeHeaderButton } from '@/components/ui/NativeHeaderButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterPills } from '@/components/ui/FilterPills';
import { expenseService } from '@/services/expenseService';
import type { Expense } from '@/types/expense';
import SwipeableExpenseCard from '@/components/expense/SwipeableExpenseCard';
import { space } from '@/theme/tokens';
import { formatMoney } from '@/utils/money';
import { useTheme } from '@/theme';

type ExpenseListNavigationProp = NativeStackNavigationProp<ExpenseStackParamList, 'ExpenseList'>;

export default function ExpenseListScreen() {
  const theme = useTheme();
  const { colors: palette, type } = theme;
  const styles = createStyles(theme);
  const navigation = useNavigation<ExpenseListNavigationProp>();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [filteredExpenses, setFilteredExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');

  const loadExpenses = async () => {
    try {
      const data = await expenseService.fetchExpenses();
      setExpenses(data);
      applyFilters(data, searchQuery, filter);
    } catch (error) {
      console.error('Error loading expenses:', error);
      Alert.alert('Error', 'Failed to load expenses. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadExpenses();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadExpenses();
  };

  const applyFilters = (data: Expense[], search: string, statusFilter: typeof filter) => {
    let filtered = data;

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((exp) => exp.status === statusFilter);
    }

    // Apply search filter
    if (search) {
      const lowerSearch = search.toLowerCase();
      filtered = filtered.filter(
        (exp) =>
          exp.description.toLowerCase().includes(lowerSearch) ||
          exp.vendorName?.toLowerCase().includes(lowerSearch) ||
          exp.category?.name.toLowerCase().includes(lowerSearch)
      );
    }

    setFilteredExpenses(filtered);
  };

  const handleSearch = (text: string) => {
    setSearchQuery(text);
    applyFilters(expenses, text, filter);
  };

  const handleFilterChange = (newFilter: typeof filter) => {
    setFilter(newFilter);
    applyFilters(expenses, searchQuery, newFilter);
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      headerSearchBarOptions:
        expenses.length > 0
          ? {
              placeholder: 'Search expenses',
              hideWhenScrolling: true,
              onChangeText: (event) => handleSearch(event.nativeEvent.text),
            }
          : undefined,
      headerRight: () => (
        <NativeHeaderButton
          label="New"
          primary
          onPress={() => navigation.navigate('ExpenseCreate')}
        />
      ),
    });
  }, [navigation, expenses, filter]);

  const handleEdit = (expenseId: string) => {
    navigation.navigate('ExpenseEdit', { expenseId });
  };

  const handleDelete = async (expenseId: string) => {
    Alert.alert(
      'Delete Expense',
      'Are you sure you want to delete this expense?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await expenseService.deleteExpense(expenseId);
              await loadExpenses();
              Alert.alert('Success', 'Expense deleted successfully');
            } catch (error) {
              console.error('Error deleting expense:', error);
              Alert.alert('Error', 'Failed to delete expense. Please try again.');
            }
          },
        },
      ]
    );
  };

  const formatCurrency = (amount: number, currency: string) => formatMoney(amount, currency);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-NZ', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const renderExpenseCard = ({ item, index }: { item: Expense; index: number }) => (
    <SwipeableExpenseCard
      expense={item}
      onPress={() => {
        handleEdit(item.id);
      }}
      onEdit={handleEdit}
      onDelete={handleDelete}
      formatCurrency={formatCurrency}
      formatDate={formatDate}
      isFirst={index === 0}
      isLast={index === filteredExpenses.length - 1}
    />
  );

  const renderFilterButtons = () => {
    if (expenses.length === 0) return null;
    return (
      <FilterPills
        options={['all', 'pending', 'approved', 'rejected'] as const}
        value={filter}
        onChange={handleFilterChange}
      />
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={palette.accent} />
        <Text style={styles.loadingText}>Loading expenses...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {Platform.OS === 'android' && expenses.length > 0 && (
        <View style={styles.androidSearch}>
          <Feather name="search" size={18} color="#64748B" />
          <TextInput
            style={styles.androidSearchInput}
            placeholder="Search expenses"
            value={searchQuery}
            onChangeText={handleSearch}
            placeholderTextColor="#94A3B8"
          />
        </View>
      )}
      {renderFilterButtons()}
      <FlatList
        data={filteredExpenses}
        keyExtractor={(item) => item.id}
        renderItem={renderExpenseCard}
        contentContainerStyle={styles.listContent}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.accent} />
        }
        ListEmptyComponent={
          expenses.length === 0 ? (
            <EmptyState
              title="No expenses yet"
              description="Log a receipt or add one by hand."
              actionLabel="Add expense"
              onAction={() => navigation.navigate('ExpenseCreate')}
            />
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No expenses match</Text>
              <Text style={styles.emptySubtext}>Try a different search or status</Text>
            </View>
          )
        }
      />
    </View>
  );
}

const createStyles = ({ colors: palette, type }: ReturnType<typeof useTheme>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: palette.background,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: palette.textSecondary,
  },
  androidSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: space.screen,
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: palette.fill,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
  },
  androidSearchInput: {
    flex: 1,
    fontSize: 16,
    color: palette.text,
  },
  listContent: {
    paddingHorizontal: space.screen,
    paddingTop: 8,
    paddingBottom: 32,
  },
  emptyContainer: {
    padding: 48,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '700',
    color: palette.text,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 15,
    color: palette.textSecondary,
    textAlign: 'center',
  },
});
