import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import BankStatementImportScreen from './BankStatementImportScreen';
jest.mock('@/hooks/useTabScreenInsets', () => ({ useTabScreenInsets: () => ({ bottomPadding: 88 }) }));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ goBack: jest.fn() }), useRoute: () => ({ params: { bankAccountId: 'bank-1' } }) }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn().mockImplementation(() => ({ text: async () => 'Posted,Memo,Value\n2026-10-01,Coffee,-5.10' })) }));
jest.mock('@/features/banking/api/bankingApi', () => ({ bankingApi: { listReconciliationTransactions: jest.fn().mockResolvedValue({ transactions: [], pagination: { totalPages: 1 } }), importTransactions: jest.fn() } }));
const clients: QueryClient[] = [];
const wrap = () => { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client); return render(<QueryClientProvider client={client}><BankStatementImportScreen /></QueryClientProvider>); };
afterEach(() => { clients.forEach(c => c.clear()); clients.length = 0; });
describe('statement mapping workflow', () => {
  it('keeps cancellation empty and offers explicit mapping for unusual columns', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({ canceled: true });
    wrap(); fireEvent.press(screen.getByText('Choose CSV file')); await waitFor(() => expect(DocumentPicker.getDocumentAsync).toHaveBeenCalled());
    expect(screen.getByText('No statement selected')).toBeTruthy();
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///statement.csv', name: 'statement.csv' }] });
    fireEvent.press(screen.getByText('Choose CSV file')); await waitFor(() => expect(screen.getByText('Column mapping')).toBeTruthy());
    expect(screen.getByText('Map date')).toBeTruthy(); expect(screen.getByText('Map amount')).toBeTruthy();
    expect(screen.queryByText('Import 1 transaction')).toBeNull();
  });
});
