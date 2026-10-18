import React, { useEffect, useMemo, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { accountService } from '@/services/accountService';
import { SelectionRow, SelectionSheet } from '@/components/ui/SelectionSheet';
import type { Account } from '@/types/expense';
import { useTheme } from '@/theme';

interface AccountPickerProps {
  visible: boolean;
  onSelect: (account: Account | null) => void;
  onClose: () => void;
  selectedAccountId?: string | null;
}

const getAccountTypeIcon = (type: string): keyof typeof Feather.glyphMap => {
  switch (type) {
    case 'bank': return 'home';
    case 'cash': return 'dollar-sign';
    case 'credit_card': return 'credit-card';
    case 'loan': return 'file-text';
    default: return 'briefcase';
  }
};

export function AccountPicker({ visible, onSelect, onClose, selectedAccountId }: AccountPickerProps) {
  const theme = useTheme();
  const { colors: palette } = theme;
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!visible) return;
    setSearchQuery('');
    setLoading(true);
    accountService.fetchAccounts()
      .then(setAccounts)
      .catch((error) => console.error('Error loading accounts:', error))
      .finally(() => setLoading(false));
  }, [visible]);

  const filteredAccounts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return accounts;
    return accounts.filter((account) =>
      account.name.toLowerCase().includes(query) || account.type.toLowerCase().includes(query)
    );
  }, [accounts, searchQuery]);

  const choose = (account: Account | null) => {
    onSelect(account);
    onClose();
  };

  return (
    <SelectionSheet
      visible={visible}
      title="Select account"
      searchPlaceholder="Search accounts"
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      onClose={onClose}
      loading={loading}
      empty={filteredAccounts.length === 0}
      emptyTitle={searchQuery ? 'No accounts found' : 'No accounts yet'}
      emptyDescription={searchQuery ? undefined : 'Accounts will appear here once created.'}
    >
      <SelectionRow
        title="No account"
        subtitle="No account assigned"
        selected={selectedAccountId === null}
        onPress={() => choose(null)}
      />
      {filteredAccounts.map((account) => (
        <SelectionRow
          key={account.id}
          title={account.name}
          subtitle={`${account.type.replace('_', ' ')} · ${account.currency}`}
          selected={selectedAccountId === account.id}
          onPress={() => choose(account)}
          leading={(
            <Feather
              name={getAccountTypeIcon(account.type)}
              size={20}
              color={palette.accentText}
            />
          )}
        />
      ))}
    </SelectionSheet>
  );
}
