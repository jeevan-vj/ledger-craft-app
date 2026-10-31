import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
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
  it('shows the exact amount, method, date and reference with an explicit reversal action', () => {
    const onReverse = jest.fn();
    const screen = render(<PaymentHistoryList payments={[payment]} currency="NZD" onReverse={onReverse} />);

    expect(screen.getByText('$9,007,199,254,740,993.25')).toBeTruthy();
    expect(screen.getByText('Bank Transfer')).toBeTruthy();
    expect(screen.getByText('25 Oct 2026 · REF-9 · Completed')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Reverse payment'));
    expect(onReverse).toHaveBeenCalledWith(payment);
    expect(screen.queryByLabelText('Edit payment')).toBeNull();
  });

  it('shows the reversal reason and cannot reverse a payment twice', () => {
    const reversed = {
      ...payment,
      status: 'refunded' as const,
      reversalReason: 'Entered against the wrong invoice',
      reversalDate: '2026-10-26',
      reversedAt: '2026-10-26T00:00:00.000Z',
    };
    const screen = render(<PaymentHistoryList payments={[reversed]} currency="NZD" onReverse={jest.fn()} />);
    expect(screen.getByText('Entered against the wrong invoice')).toBeTruthy();
    expect(screen.queryByLabelText('Reverse payment')).toBeNull();
  });

  it('shows an empty history without a record action', () => {
    const screen = render(<PaymentHistoryList payments={[]} currency="NZD" />);
    expect(screen.getByText('No payments recorded')).toBeTruthy();
    expect(screen.queryByText('Record payment')).toBeNull();
  });
});
