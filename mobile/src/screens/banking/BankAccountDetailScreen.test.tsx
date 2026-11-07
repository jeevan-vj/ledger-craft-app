import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BankAccountDetailScreen from './BankAccountDetailScreen';
jest.mock('@/hooks/useTabScreenInsets', () => ({ useTabScreenInsets: () => ({ bottomPadding: 88 }) }));
jest.mock('@react-navigation/native', () => ({ useFocusEffect: () => undefined, useNavigation: () => ({ setOptions: jest.fn(), navigate: jest.fn() }), useRoute: () => ({ params: { bankAccountId: 'bank-1' } }) }));
jest.mock('@/features/banking/api/bankingApi', () => ({ bankingApi: { getAccount: jest.fn().mockResolvedValue({ id: 'bank-1', accountName: 'Operating', accountType: 'business', currency: 'NZD', currentBalance: '100.05', openingBalance: '100.00', isActive: true }), listReconciliationTransactions: jest.fn().mockResolvedValue({ transactions: [], pagination: { page: 1, pageSize: 20, total: 21, totalPages: 2 } }), getDefaultAccount: jest.fn().mockResolvedValue({ bankAccountId: 'bank-1' }), movements: jest.fn().mockResolvedValue({ openingBalance: '100.00', inflows: '0.15', outflows: '0.10', movement: '0.05', closingBalance: '100.05', currency: 'NZD' }) } }));
jest.mock('@/store', () => ({ useStore: (selector: (state: unknown) => unknown) => selector({ permissions: ['banking.write'] }) }));
const clients: QueryClient[] = [];
afterEach(() => { clients.forEach(c => c.clear()); clients.length = 0; });
it('shows authoritative movements, default-account identity and paginated transactions', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
  const view = render(<QueryClientProvider client={client}><BankAccountDetailScreen /></QueryClientProvider>);
  await waitFor(() => expect(screen.getByText('Default payment account')).toBeTruthy());
  expect(StyleSheet.flatten(view.UNSAFE_getAllByType(ScrollView)[0].props.contentContainerStyle).paddingBottom).toBe(88);
  expect(screen.getByText('Net movement')).toBeTruthy(); expect(screen.getByText('$0.05')).toBeTruthy();
  expect(screen.getByText('Page 1 of 2')).toBeTruthy(); expect(screen.getByText('Next')).toBeTruthy();
});
