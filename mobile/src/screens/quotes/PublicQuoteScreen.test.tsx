import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PublicQuoteScreen from './PublicQuoteScreen';
import { quotesApi } from '@/features/quotes/api/quotesApi';

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useRoute: () => ({ params: { shareToken: 'org_token' } }),
  };
});

jest.mock('react-native-webview', () => ({ WebView: () => null }));

jest.mock('@/features/quotes/api/quotesApi', () => ({
  quotesApi: { getPublic: jest.fn(), respond: jest.fn() },
}));

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PublicQuoteScreen />
    </QueryClientProvider>,
  );
}

describe('PublicQuoteScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows an inactive quote link without a retry or a connection error', async () => {
    (quotesApi.getPublic as jest.Mock).mockResolvedValue('inactive');

    const view = renderScreen();

    expect(await view.findByText('This link is no longer active.')).toBeTruthy();
    expect(view.queryByLabelText('Try again')).toBeNull();
    expect(view.queryByText(/connection/i)).toBeNull();
    expect(view.queryByText('Download PDF')).toBeNull();
  });

  it('shows an unknown quote token as not found', async () => {
    (quotesApi.getPublic as jest.Mock).mockResolvedValue(null);

    const view = renderScreen();

    expect(await view.findByText('This quote link could not be found.')).toBeTruthy();
    expect(view.queryByLabelText('Try again')).toBeNull();
    expect(view.queryByText(/expired/i)).toBeNull();
  });

  it('keeps a retry when the public quote cannot be reached', async () => {
    (quotesApi.getPublic as jest.Mock).mockRejectedValue(new Error('offline'));

    const view = renderScreen();

    expect(await view.findByText('The shared quote could not be loaded. Check your connection and try again.')).toBeTruthy();
    await waitFor(() => expect(view.getByLabelText('Try again')).toBeTruthy());
    expect(view.queryByText('This link is no longer active.')).toBeNull();
  });
});
