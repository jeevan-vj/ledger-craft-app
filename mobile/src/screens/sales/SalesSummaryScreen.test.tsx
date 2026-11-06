import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { currencyApi } from '@/features/currency/currencyApi';
import { salesSummaryApi } from '@/features/sales/salesSummaryApi';
import SalesSummaryScreen from './SalesSummaryScreen';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ getParent: () => ({ navigate: mockNavigate }) }),
  useFocusEffect: (callback: () => void) => { const ReactLib = jest.requireActual('react'); ReactLib.useEffect(callback, [callback]); },
}));
jest.mock('@/features/currency/currencyApi', () => ({ currencyApi: { get: jest.fn() } }));
jest.mock('@/features/sales/salesSummaryApi', () => ({
  salesSummaryApi: { get: jest.fn() },
  businessSalesDate: () => '2026-11-06',
}));
jest.mock('@/hooks/useTabScreenInsets', () => ({ useTabScreenInsets: () => ({ bottomPadding: 100 }) }));
const summary = {
  date: '2026-11-06', count: 1, grossTotal: '13.50', gstTotal: '1.76',
  paymentMethods: [{ paymentMethod: 'cash', total: '13.50' }],
  topItemsByQuantity: [{ description: 'Pie', quantity: '3.00', amount: '13.50' }],
  topItemsByAmount: [{ description: 'Pie', quantity: '3.00', amount: '13.50' }],
  sales: [{ invoiceId: 'invoice-1', invoiceNumber: 'INV-0042', total: '13.50', taxAmount: '1.76' }],
};
function renderSummary() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(<QueryClientProvider client={client}><SalesSummaryScreen /></QueryClientProvider>);
}
describe('SalesSummaryScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (currencyApi.get as jest.Mock).mockResolvedValue({ localization: { timezone: 'Pacific/Auckland', baseCurrency: 'NZD' } });
    (salesSummaryApi.get as jest.Mock).mockResolvedValue(summary);
  });
  it('shows loading until the summary is received', async () => {
    (salesSummaryApi.get as jest.Mock).mockReturnValue(new Promise(() => {}));
    const screen = renderSummary();
    await waitFor(() => expect(screen.getByText('Loading sales summary')).toBeTruthy());
  });
  it('renders exact server totals, rankings and opens a sale invoice', async () => {
    const screen = renderSummary();
    await waitFor(() => expect(screen.getByText('INV-0042')).toBeTruthy());
    expect(salesSummaryApi.get).toHaveBeenCalledWith('2026-11-06');
    expect(screen.getByText('$1.76')).toBeTruthy();
    expect(screen.getByText('Top items by quantity')).toBeTruthy();
    expect(screen.getByText('Top items by amount')).toBeTruthy();
    expect(screen.getByText('Cash')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Open sale INV-0042'));
    expect(mockNavigate).toHaveBeenCalledWith('Invoices', { state: { index: 1, routes: [
      { name: 'InvoiceList' }, { name: 'InvoiceDetail', params: { invoiceId: 'invoice-1' } },
    ] } });
  });
  it('loads a past date and rejects an impossible date without a request', async () => {
    const screen = renderSummary();
    await waitFor(() => expect(screen.getByText('INV-0042')).toBeTruthy());
    fireEvent.changeText(screen.getByLabelText('Sales date'), '2026-10-25');
    fireEvent.press(screen.getByLabelText('Show sales'));
    await waitFor(() => expect(salesSummaryApi.get).toHaveBeenCalledWith('2026-10-25'));
    fireEvent.changeText(screen.getByLabelText('Sales date'), '2026-02-30');
    fireEvent.press(screen.getByLabelText('Show sales'));
    expect(screen.getByText('Enter a real date as YYYY-MM-DD.')).toBeTruthy();
    expect(salesSummaryApi.get).not.toHaveBeenCalledWith('2026-02-30');
  });
  it('lets the date be cleared and returns to the business day with Today', async () => {
    const screen = renderSummary();
    await waitFor(() => expect(screen.getByText('INV-0042')).toBeTruthy());
    fireEvent.changeText(screen.getByLabelText('Sales date'), '');
    expect(screen.getByLabelText('Sales date').props.value).toBe('');
    fireEvent.press(screen.getByLabelText('Show sales'));
    expect(screen.getByText('Enter a real date as YYYY-MM-DD.')).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Sales date'), '2026-10-25');
    fireEvent.press(screen.getByLabelText('Show sales'));
    await waitFor(() => expect(salesSummaryApi.get).toHaveBeenCalledWith('2026-10-25'));
    fireEvent.press(screen.getByLabelText("Today's sales"));
    await waitFor(() => expect(screen.getByLabelText('Sales date').props.value).toBe('2026-11-06'));
  });
  it('shows the empty day instead of hiding the zero totals', async () => {
    (salesSummaryApi.get as jest.Mock).mockResolvedValue({ ...summary, count: 0, grossTotal: '0.00', gstTotal: '0.00', paymentMethods: [], topItemsByQuantity: [], topItemsByAmount: [], sales: [] });
    const screen = renderSummary();
    await waitFor(() => expect(screen.getByText('No sales on this day')).toBeTruthy());
    expect(screen.getByText('Gross total')).toBeTruthy();
    expect(screen.getByText('GST included')).toBeTruthy();
  });
  it('shows an honest error and retries the selected day', async () => {
    (salesSummaryApi.get as jest.Mock).mockRejectedValueOnce(new Error('Offline'));
    const screen = renderSummary();
    await waitFor(() => expect(screen.getByText('Sales summary unavailable')).toBeTruthy());
    fireEvent.press(screen.getByText('Try again'));
    await waitFor(() => expect(screen.getByText('INV-0042')).toBeTruthy());
  });
  it('does not guess the business day when timezone settings cannot load', async () => {
    (currencyApi.get as jest.Mock).mockRejectedValue(new Error('Unavailable'));
    const screen = renderSummary();
    await waitFor(() => expect(screen.getByText('Business settings unavailable')).toBeTruthy());
    expect(salesSummaryApi.get).not.toHaveBeenCalled();
  });
});
