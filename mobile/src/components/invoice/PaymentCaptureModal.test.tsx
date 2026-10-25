import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { onlineManager } from '@tanstack/react-query';
import { AuthApiError } from '@/features/auth/api/http';
import { mockInvoice } from '@/__tests__/fixtures/invoice.fixtures';
import PaymentCaptureModal from './PaymentCaptureModal';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 20, left: 0, right: 0 }),
}));

const invoice = {
  ...mockInvoice,
  id: '22222222-2222-4222-8222-222222222222',
  invoiceNumber: 'INV-9',
  total: 200,
  balanceDue: 50,
  balanceDueText: '50.00',
  status: 'sent' as const,
  currency: 'NZD',
};

function renderModal(onSubmit = jest.fn().mockResolvedValue(undefined)) {
  const view = render(
    <PaymentCaptureModal visible invoice={invoice} onSubmit={onSubmit} onClose={jest.fn()} />,
  );
  return { ...view, onSubmit };
}

describe('PaymentCaptureModal', () => {
  beforeEach(() => {
    onlineManager.setOnline(true);
  });

  it('defaults the amount to the exact balance due', () => {
    const { getByLabelText } = renderModal();
    expect(getByLabelText('Payment amount').props.value).toBe('50.00');
  });

  it('rejects an amount above the balance before calling the server', () => {
    const { getByLabelText, getByText, onSubmit } = renderModal();
    fireEvent.changeText(getByLabelText('Payment amount'), '50.01');
    fireEvent.press(getByLabelText('Record payment'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(getByText('Amount cannot exceed the balance due.')).toBeTruthy();
  });

  it('keeps one idempotency key across a retry and disables the button while submitting', async () => {
    let resolveSubmit: (() => void) | undefined;
    const onSubmit = jest.fn()
      .mockRejectedValueOnce(new AuthApiError('offline', 0, 'OFFLINE'))
      .mockImplementationOnce(() => new Promise<void>((resolve) => { resolveSubmit = resolve; }));
    const screen = renderModal(onSubmit);

    fireEvent.press(screen.getByLabelText('Record payment'));
    expect(await screen.findByText(/offline/i)).toBeTruthy();
    expect(screen.getByText(/will not be sent later/i)).toBeTruthy();
    const firstKey = onSubmit.mock.calls[0]?.[1];

    fireEvent.press(screen.getByLabelText('Record payment'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit.mock.calls[1]?.[1]).toBe(firstKey);
    expect(onSubmit.mock.calls[1]?.[0].amount).toBe('50.00');
    expect(screen.getByLabelText('Record payment').props.accessibilityState.disabled).toBe(true);

    fireEvent.press(screen.getByLabelText('Record payment'));
    expect(onSubmit).toHaveBeenCalledTimes(2);
    resolveSubmit?.();
    await waitFor(() => expect(screen.getByLabelText('Record payment').props.accessibilityState.disabled).toBe(false));
  });

  it('mints a new key after the form changes and after a successful submit', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const screen = renderModal(onSubmit);

    fireEvent.press(screen.getByLabelText('Record payment'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByLabelText('Record payment').props.accessibilityState.disabled).toBe(false));
    const firstKey = onSubmit.mock.calls[0]?.[1];

    fireEvent.press(screen.getByLabelText('Record payment'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit.mock.calls[1]?.[1]).not.toBe(firstKey);

    fireEvent.changeText(screen.getByLabelText('Payment amount'), '25.00');
    fireEvent.press(screen.getByLabelText('Record payment'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(3));
    expect(onSubmit.mock.calls[2]?.[1]).not.toBe(onSubmit.mock.calls[1]?.[1]);
    expect(onSubmit.mock.calls[2]?.[0].amount).toBe('25.00');
  });

  it('shows a balance conflict and resets the key after an idempotency conflict', async () => {
    const onSubmit = jest.fn()
      .mockRejectedValueOnce(new AuthApiError('Payment exceeds invoice balance', 400, 'PAYMENT_EXCEEDS_BALANCE'))
      .mockRejectedValueOnce(new AuthApiError('Idempotency-Key was reused with a different request', 409, 'IDEMPOTENCY_CONFLICT'))
      .mockResolvedValueOnce(undefined);
    const screen = renderModal(onSubmit);

    fireEvent.press(screen.getByLabelText('Record payment'));
    expect(await screen.findByText(/more than the balance due/i)).toBeTruthy();
    const balanceKey = onSubmit.mock.calls[0]?.[1];

    fireEvent.press(screen.getByLabelText('Record payment'));
    expect(await screen.findByText(/different request/i)).toBeTruthy();
    expect(onSubmit.mock.calls[1]?.[1]).toBe(balanceKey);

    fireEvent.press(screen.getByLabelText('Record payment'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(3));
    expect(onSubmit.mock.calls[2]?.[1]).not.toBe(balanceKey);
  });
});
