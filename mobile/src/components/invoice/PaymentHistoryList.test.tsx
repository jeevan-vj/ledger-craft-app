import React from 'react';
import { render } from '@testing-library/react-native';
import { PaymentHistoryList } from './PaymentHistoryList';
import type { Payment } from '@/types/payment';

const payment: Payment = {
  id: '11111111-1111-4111-8111-111111111111',
  invoiceId: '22222222-2222-4222-8222-222222222222',
  userId: '',
  paymentMethod: 'bank_transfer',
  amount: '9007199254740993.25',
  paymentDate: '2026-10-25',
  referenceNumber: 'REF-9',
  notes: null,
  status: 'completed',
  createdAt: '2026-10-25T00:00:00.000Z',
  updatedAt: '2026-10-25T00:00:00.000Z',
};

describe('PaymentHistoryList', () => {
  it('shows the exact amount, method, date and reference, and no payment actions', () => {
    const screen = render(<PaymentHistoryList payments={[payment]} currency="NZD" />);

    expect(screen.getByText('$9,007,199,254,740,993.25')).toBeTruthy();
    expect(screen.getByText('Bank Transfer')).toBeTruthy();
    expect(screen.getByText('25 Oct 2026 · REF-9 · Completed')).toBeTruthy();
    expect(screen.queryByText('Void')).toBeNull();
    expect(screen.queryByText('Refund')).toBeNull();
    expect(screen.queryByLabelText('Edit payment')).toBeNull();
  });

  it('shows an empty history without a record action', () => {
    const screen = render(<PaymentHistoryList payments={[]} currency="NZD" />);
    expect(screen.getByText('No payments recorded')).toBeTruthy();
    expect(screen.queryByText('Record payment')).toBeNull();
  });
});
