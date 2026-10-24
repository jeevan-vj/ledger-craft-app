import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import PublicInvoiceScreen from './PublicInvoiceScreen';
import { invoiceService } from '@/services/invoiceService';

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useRoute: () => ({ params: { shareToken: 'org_token' } }),
  };
});

jest.mock('react-native-webview', () => ({ WebView: () => null }));

jest.mock('@/services/invoiceService', () => ({
  invoiceService: {
    fetchSharedInvoice: jest.fn(),
  },
}));

jest.mock('@/utils/pdfUtils', () => ({
  downloadInvoicePDF: jest.fn(),
  shareInvoicePDF: jest.fn(),
}));

describe('PublicInvoiceScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows an inactive link without a retry or a connection error', async () => {
    (invoiceService.fetchSharedInvoice as jest.Mock).mockResolvedValue('inactive');

    const view = render(<PublicInvoiceScreen />);

    expect(await view.findByText('This link is no longer active.')).toBeTruthy();
    expect(view.queryByText('The shared invoice could not be loaded. Check your connection and try again.')).toBeNull();
    expect(view.queryByLabelText('Try again')).toBeNull();
    expect(view.queryByText('Download PDF')).toBeNull();
  });

  it('keeps a retry on a connection failure', async () => {
    (invoiceService.fetchSharedInvoice as jest.Mock).mockRejectedValue(new Error('offline'));

    const view = render(<PublicInvoiceScreen />);

    expect(await view.findByText('The shared invoice could not be loaded. Check your connection and try again.')).toBeTruthy();
    await waitFor(() => expect(view.getByLabelText('Try again')).toBeTruthy());
    expect(view.queryByText('This link is no longer active.')).toBeNull();
  });
});
