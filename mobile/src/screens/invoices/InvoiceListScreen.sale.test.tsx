import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { invoiceService } from '@/services/invoiceService';
import { mockInvoice } from '@/__tests__/fixtures/invoice.fixtures';
import InvoiceListScreen from './InvoiceListScreen';

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  const ReactLib = jest.requireActual('react');
  return {
    ...actual,
    useNavigation: () => ({
      navigate: jest.fn(),
      setOptions: jest.fn(),
      getParent: () => ({ getParent: () => ({ navigate: jest.fn() }) }),
    }),
    useFocusEffect: (effect: () => void) => {
      ReactLib.useEffect(() => effect(), [effect]);
    },
  };
});

jest.mock('@/hooks/useTabScreenInsets', () => ({
  useTabScreenInsets: () => ({
    safeArea: { top: 0, bottom: 0, left: 0, right: 0 },
    tabBarClearance: 0,
    bottomPadding: 0,
  }),
}));

jest.mock('@/services/invoiceService', () => ({
  invoiceService: { fetchInvoices: jest.fn() },
}));

jest.mock('@/components/invoice/SwipeableInvoiceCard', () => {
  const ReactLib = jest.requireActual('react');
  const { Text: NativeText } = jest.requireActual('react-native');
  return function MockInvoiceCard({ invoice }: { invoice: { invoiceNumber: string; status: string; customer?: { name?: string } } }) {
    return ReactLib.createElement(NativeText, null, `${invoice.invoiceNumber} ${invoice.customer?.name ?? ''} ${invoice.status}`);
  };
});

describe('invoice list sales', () => {
  it('shows a paid quick sale among ordinary invoices', async () => {
    jest.mocked(invoiceService.fetchInvoices).mockResolvedValue([{
      ...mockInvoice,
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      invoiceNumber: 'INV-2041',
      status: 'paid',
      total: 13.5,
      customer: { id: 'walk-in', name: 'Walk-in customer', email: '' },
    }]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const screen = render(
      <QueryClientProvider client={client}>
        <InvoiceListScreen />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('INV-2041 Walk-in customer paid')).toBeTruthy();
    await waitFor(() => expect(invoiceService.fetchInvoices).toHaveBeenCalled());
  });
});
