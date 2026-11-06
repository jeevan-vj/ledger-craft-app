import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { invoiceService } from '@/services/invoiceService';
import { mockInvoice } from '@/__tests__/fixtures/invoice.fixtures';
import InvoiceListScreen from './InvoiceListScreen';
import { customersApi, type MobileCustomerDto } from '@/features/customers/api/customersApi';

const mockSetOptions = jest.fn();

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  const ReactLib = jest.requireActual('react');
  return {
    ...actual,
    useNavigation: () => ({
      navigate: jest.fn(),
      setOptions: mockSetOptions,
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

jest.mock('@/features/customers/api/customersApi', () => ({ customersApi: { list: jest.fn() } }));

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

const walkIn = { id: 'walk-in', name: 'Walk-in customer', tags: ['walk-in'] } as MobileCustomerDto;
const sale = { ...mockInvoice, id: 'sale', customerId: 'walk-in', invoiceNumber: 'INV-SALE', status: 'paid' as const, customer: { id: 'walk-in', name: 'Walk-in customer', email: '' } };
const ordinary = { ...mockInvoice, id: 'regular', customerId: 'regular-customer', invoiceNumber: 'INV-REGULAR', status: 'draft' as const };

function renderList() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(<QueryClientProvider client={client}><InvoiceListScreen /></QueryClientProvider>);
}

describe('invoice list sales', () => {
  beforeEach(() => {
    jest.mocked(customersApi.list).mockReset().mockResolvedValue([walkIn]);
    mockSetOptions.mockClear();
    jest.mocked(invoiceService.fetchInvoices).mockResolvedValue([sale, ordinary]);
  });

  it('filters walk-in sales separately from regular invoices and combines the status filter', async () => {
    const screen = renderList();
    expect(await screen.findByText(/INV-SALE/)).toBeTruthy();
    expect(screen.getByText(/INV-REGULAR/)).toBeTruthy();
    fireEvent.press(screen.getByRole('tab', { name: 'Sales' }));
    await waitFor(() => expect(screen.queryByText(/INV-REGULAR/)).toBeNull());
    expect(await screen.findByText(/INV-SALE/)).toBeTruthy();
    fireEvent.press(screen.getByRole('tab', { name: 'Draft' }));
    expect(screen.queryByText(/INV-SALE/)).toBeNull();
    expect(screen.getByText('No invoices match')).toBeTruthy();
    fireEvent.press(screen.getByRole('tab', { name: 'Regular invoices' }));
    expect(screen.getByText(/INV-REGULAR/)).toBeTruthy();
    fireEvent.press(screen.getByRole('tab', { name: 'All documents' }));
    fireEvent.press(screen.getByRole('tab', { name: 'All' }));
    expect(screen.getByText(/INV-SALE/)).toBeTruthy();
    expect(screen.getByText(/INV-REGULAR/)).toBeTruthy();
  });

  it('combines search with sale classification and Show all resets both filters', async () => {
    const screen = renderList();
    await screen.findByText(/INV-SALE/);
    fireEvent.press(screen.getByRole('tab', { name: 'Sales' }));
    await screen.findByText(/INV-SALE/);
    const options = mockSetOptions.mock.calls.at(-1)?.[0];
    act(() => options.headerSearchBarOptions.onChangeText({ nativeEvent: { text: 'REGULAR' } }));
    expect(screen.queryByText(/INV-SALE/)).toBeNull();
    expect(screen.queryByText(/INV-REGULAR/)).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Show all' }));
    expect(screen.getByText(/INV-SALE/)).toBeTruthy();
    expect(screen.getByText(/INV-REGULAR/)).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'All documents' }).props.accessibilityState.selected).toBe(true);
  });

  it('hides classified results while the customer tags are loading', async () => {
    let finish!: (customers: MobileCustomerDto[]) => void;
    jest.mocked(customersApi.list).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const screen = renderList();
    await screen.findByText(/INV-SALE/);
    fireEvent.press(screen.getByRole('tab', { name: 'Sales' }));
    expect(await screen.findByLabelText('Loading sale filters')).toBeTruthy();
    expect(screen.queryByText(/INV-SALE/)).toBeNull();
    expect(screen.queryByText(/INV-REGULAR/)).toBeNull();
    await act(async () => finish([walkIn]));
    expect(await screen.findByText(/INV-SALE/)).toBeTruthy();
    expect(screen.queryByText(/INV-REGULAR/)).toBeNull();
  });

  it('shows a retryable tag lookup error without classifying unknown rows as ordinary invoices', async () => {
    jest.mocked(customersApi.list).mockRejectedValueOnce(new Error('offline'));
    const screen = renderList();
    await screen.findByText(/INV-SALE/);
    fireEvent.press(screen.getByRole('tab', { name: 'Regular invoices' }));
    expect(await screen.findByText("Couldn't load sale filters")).toBeTruthy();
    expect(screen.queryByText(/INV-SALE/)).toBeNull();
    expect(screen.queryByText(/INV-REGULAR/)).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(/INV-REGULAR/)).toBeTruthy();
    expect(screen.queryByText(/INV-SALE/)).toBeNull();
  });

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
