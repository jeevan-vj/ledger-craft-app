import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SettlementRatePicker } from './SettlementRatePicker';
import { currencyApi } from '@/features/currency/currencyApi';
jest.mock('@/features/currency/currencyApi', () => ({ currencyApi: { get: jest.fn() } }));
it('offers only reviewed source-currency rates dated on or before settlement and passes the exact rate identity', async () => {
  jest.mocked(currencyApi.get).mockResolvedValue({ rates: [{ id: 'usd165', currencyCode: 'USD', baseCurrency: 'NZD', effectiveDate: '2026-04-10', rate: '1.650000' }, { id: 'future', currencyCode: 'USD', baseCurrency: 'NZD', effectiveDate: '2026-05-01', rate: '1.700000' }, { id: 'eur', currencyCode: 'EUR', baseCurrency: 'NZD', effectiveDate: '2026-04-01', rate: '1.80' }] } as never);
  const onChange = jest.fn(); const screen = render(<SettlementRatePicker currency="USD" paymentDate="2026-04-20" onChange={onChange} />);
  fireEvent.press(await screen.findByText('1 USD = 1.650000 NZD · 2026-04-10'));
  expect(onChange).toHaveBeenCalledWith('usd165');
  expect(screen.queryByText(/1.700000/)).toBeNull(); expect(screen.queryByText(/EUR/)).toBeNull();
});
it('shows retryable rate loading errors and excludes foreign UI for NZD', async () => {
  jest.mocked(currencyApi.get).mockRejectedValue(new Error('Rates unavailable'));
  const screen = render(<SettlementRatePicker currency="USD" paymentDate="2026-04-20" onChange={jest.fn()} />);
  expect(await screen.findByText('Rates unavailable')).toBeTruthy();
  expect(screen.getByText('Retry exchange rates')).toBeTruthy();
  screen.rerender(<SettlementRatePicker currency="NZD" paymentDate="2026-04-20" onChange={jest.fn()} />);
  expect(screen.queryByText('Reviewed settlement exchange rate')).toBeNull();
});
