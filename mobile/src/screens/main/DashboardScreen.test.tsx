import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { StyleSheet, type ViewStyle } from 'react-native';
import DashboardScreen from './DashboardScreen';
import { invoiceService } from '@/services/invoiceService';
import { useStore } from '@/store';
import { darkPalette } from '@/theme/tokens';
import { dashboardApi } from '@/features/dashboard/api/dashboardApi';

const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ navigate: mockNavigate }),
  };
});

jest.mock('@/hooks/useTabScreenInsets', () => ({
  useTabScreenInsets: () => ({
    safeArea: { top: 47, bottom: 34, left: 0, right: 0 },
    tabBarClearance: 80,
    bottomPadding: 120,
  }),
}));

jest.mock('@/services/invoiceService', () => ({
  invoiceService: {
    fetchInvoices: jest.fn(),
  },
}));

jest.mock('@/features/quotes/api/quotesApi', () => ({
  quotesApi: {
    list: jest.fn().mockResolvedValue({ quotes: [], counts: {} }),
  },
}));

jest.mock('@/features/dashboard/api/dashboardApi', () => ({
  dashboardApi: {
    getDashboard: jest.fn(),
    listSavedReports: jest.fn(),
  },
}));

const reportFilters = { from: '2026-10-01', to: '2026-10-31', comparison: 'previous_period' as const };
const widgetKinds = ['summary', 'receivables', 'payables', 'cash', 'tax', 'activity'] as const;
const dashboardPayload = {
  layout: {
    id: '11111111-1111-4111-8111-111111111111', name: 'My dashboard', isDefault: true,
    filters: reportFilters,
    widgets: widgetKinds.map((kind, order) => ({ kind, order, visible: true, size: kind === 'summary' ? 'large' as const : 'medium' as const })),
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  },
  reports: widgetKinds.map((type) => ({
    type, filters: reportFilters,
    authority: { status: 'provisional' as const, dependency: 'AKP-05' as const, message: 'Pending ledger authority.' },
    metrics: [{ key: `${type}-total`, label: type === 'cash' ? 'Account balance' : 'Total', value: type === 'cash' ? '1234.56' : '12.34', comparisonValue: '10.00', currency: 'NZD' }],
    rows: [],
  })),
};

function flatStyle(style: unknown): ViewStyle {
  return StyleSheet.flatten(style as ViewStyle) ?? {};
}

describe('Home quick actions', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    (invoiceService.fetchInvoices as jest.Mock).mockResolvedValue([]);
    (dashboardApi.getDashboard as jest.Mock).mockResolvedValue(dashboardPayload);
    (dashboardApi.listSavedReports as jest.Mock).mockResolvedValue([]);
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);
    useStore.setState({
      user: { id: 'user-1', email: 'niro@example.com', user_metadata: { full_name: 'Niro' } },
    });
  });

  it('renders the shared server report widgets and AKP-05 authority label', async () => {
    const screen = render(<DashboardScreen />);
    expect(await screen.findByText('Business reports')).toBeTruthy();
    expect(screen.getByText('Provisional · AKP-05')).toBeTruthy();
    expect(screen.getByLabelText('Operational balance $1,234.56')).toBeTruthy();
    expect(screen.getByText('receivables')).toBeTruthy();
  });

  it('renders home actions that open distinct screens', async () => {
    const { findByRole } = render(<DashboardScreen />);

    expect(await findByRole('button', { name: 'New invoice' })).toHaveProp(
      'accessibilityHint',
      'Creates a new invoice',
    );
    expect(await findByRole('button', { name: 'New quote' })).toHaveProp(
      'accessibilityHint',
      'Creates a quote or estimate',
    );
    expect(await findByRole('button', { name: 'Record payment' })).toHaveProp(
      'accessibilityHint',
      'Opens invoices to record a payment',
    );
    expect(await findByRole('button', { name: 'Add expense' })).toHaveProp(
      'accessibilityHint',
      'Creates a new expense',
    );
    expect(await findByRole('button', { name: 'Add customer' })).toHaveProp(
      'accessibilityHint',
      'Creates a new customer',
    );

    fireEvent.press(await findByRole('button', { name: 'New invoice' }));
    fireEvent.press(await findByRole('button', { name: 'New quote' }));
    fireEvent.press(await findByRole('button', { name: 'Record payment' }));
    fireEvent.press(await findByRole('button', { name: 'Add expense' }));
    fireEvent.press(await findByRole('button', { name: 'Add customer' }));

    expect(mockNavigate).toHaveBeenNthCalledWith(1, 'Invoices', {
      state: {
        index: 1,
        routes: [{ name: 'InvoiceList' }, { name: 'InvoiceCreate' }],
      },
    });
    expect(mockNavigate).toHaveBeenNthCalledWith(2, 'Invoices', {
      state: {
        index: 2,
        routes: [
          { name: 'InvoiceList' },
          { name: 'QuoteList' },
          { name: 'QuoteCreate' },
        ],
      },
    });
    expect(mockNavigate).toHaveBeenNthCalledWith(3, 'Invoices', {
      state: { index: 0, routes: [{ name: 'InvoiceList' }] },
    });
    expect(mockNavigate).toHaveBeenNthCalledWith(4, 'More', {
      state: {
        index: 1,
        routes: [{ name: 'SettingsList' }, { name: 'ExpenseCreate' }],
      },
    });
    expect(mockNavigate).toHaveBeenNthCalledWith(5, 'Customers', {
      state: {
        index: 1,
        routes: [{ name: 'CustomerList' }, { name: 'CustomerCreate' }],
      },
    });
  });

  it('renders Continue as a lime button and remembers Dismiss', async () => {
    const first = render(<DashboardScreen />);
    const continueButton = await first.findByRole('button', { name: 'Continue' });
    expect(flatStyle(continueButton.props.style).backgroundColor).toBe(darkPalette.accent);

    fireEvent.press(first.getByRole('button', { name: 'Dismiss' }));
    expect(SecureStore.setItemAsync).toHaveBeenCalled();
    const [key, value] = (SecureStore.setItemAsync as jest.Mock).mock.calls.at(-1);
    first.unmount();

    (SecureStore.getItemAsync as jest.Mock).mockImplementation(async (storedKey: string) => (
      storedKey === key ? value : null
    ));
    const second = render(<DashboardScreen />);
    expect(await second.findByText("You're all caught up")).toBeTruthy();
    expect(second.queryByText('Finish setting up')).toBeNull();
    await waitFor(() => {
      expect(second.queryByRole('button', { name: 'Continue' })).toBeNull();
    });
  });
});
