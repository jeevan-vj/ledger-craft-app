import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { expenseCategoryService } from '@/services/expenseCategoryService';
import { SelectionRow, SelectionSheet } from '@/components/ui/SelectionSheet';
import { radius } from '@/theme/tokens';
import type { ExpenseCategory } from '@/types/expense';
import { useTheme } from '@/theme';

interface CategoryPickerProps {
  visible: boolean;
  onSelect: (category: ExpenseCategory | null) => void;
  onClose: () => void;
  selectedCategoryId?: string | null;
}

export function CategoryPicker({ visible, onSelect, onClose, selectedCategoryId }: CategoryPickerProps) {
  const theme = useTheme();
  const { colors: palette, type } = theme;
  const styles = createStyles(theme);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!visible) return;
    setSearchQuery('');
    setLoading(true);
    expenseCategoryService.fetchExpenseCategories()
      .then(setCategories)
      .catch((error) => console.error('Error loading categories:', error))
      .finally(() => setLoading(false));
  }, [visible]);

  const filteredCategories = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return categories;
    return categories.filter((category) =>
      category.name.toLowerCase().includes(query) || category.description?.toLowerCase().includes(query)
    );
  }, [categories, searchQuery]);

  const choose = (category: ExpenseCategory | null) => {
    onSelect(category);
    onClose();
  };

  return (
    <SelectionSheet
      visible={visible}
      title="Select category"
      searchPlaceholder="Search categories"
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      onClose={onClose}
      loading={loading}
      empty={filteredCategories.length === 0}
      emptyTitle={searchQuery ? 'No categories found' : 'No categories yet'}
      emptyDescription={searchQuery ? undefined : 'Categories will appear here once created.'}
    >
      <SelectionRow
        title="No category"
        subtitle="Uncategorized expense"
        selected={selectedCategoryId === null}
        onPress={() => choose(null)}
      />
      {filteredCategories.map((category) => (
        <SelectionRow
          key={category.id}
          title={category.name}
          subtitle={category.description || undefined}
          selected={selectedCategoryId === category.id}
          onPress={() => choose(category)}
          leading={(
            <View
              style={[
                styles.colorDot,
                { backgroundColor: category.color || palette.textTertiary },
              ]}
            />
          )}
        />
      ))}
    </SelectionSheet>
  );
}

const createStyles = ({ colors: palette, type }: ReturnType<typeof useTheme>) => StyleSheet.create({
  colorDot: {
    width: 16,
    height: 16,
    borderRadius: radius.pill,
  },
});
