import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { Payment } from '@/types/payment';
import { PaymentReversalModal } from './PaymentReversalModal';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 20, left: 0, right: 0 }),
}));

const payment: Payment = {
  id: '11111111-1111-4111-8111-111111111111',
  invoiceId: '22222222-2222-4222-8222-222222222222',
  userId: '',
  paymentMethod: 'bank_transfer',
  amount: '100.00',
  paymentDate: '2026-10-25',
  status: 'completed',
  createdAt: '2026-10-25T00:00:00.000Z',
  updatedAt: '2026-10-25T00:00:00.000Z',
};

describe('PaymentReversalModal', () => {
  it('keeps the original payment immutable and captures the reversal reason and date', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const screen = render(
      <PaymentReversalModal visible payment={payment} onClose={jest.fn()} onSubmit={onSubmit} />,
    );

    fireEvent.press(screen.getByLabelText('Confirm payment reversal'));
    expect(screen.getByText(/enter a reason/i)).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Reversal reason'), 'Entered against the wrong invoice');
    fireEvent.press(screen.getByLabelText('Confirm payment reversal'));

    const today = new Date();
    const offset = today.getTimezoneOffset() * 60_000;
    const reversalDate = new Date(today.getTime() - offset).toISOString().slice(0, 10);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({
      reason: 'Entered against the wrong invoice',
      reversalDate,
    }));
  }, 30_000);
});
