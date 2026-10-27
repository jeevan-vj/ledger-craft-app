import React, { useState } from 'react';
import { Modal } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { onlineManager, QueryClient } from '@tanstack/react-query';
import { AuthApiError } from '@/features/auth/api/http';
import { PaymentExceedsBalanceError, pendingPaymentAttempt, resetPaymentAttemptStore } from '@/features/payments/paymentModel';
import { submitInvoicePayment } from '@/features/payments/paymentQueries';
import { invoiceService } from '@/services/invoiceService';
import { paymentService } from '@/services/paymentService';
import { mockInvoice } from '@/__tests__/fixtures/invoice.fixtures';
import type { Invoice } from '@/types/invoice';
import PaymentCaptureModal from './PaymentCaptureModal';

jest.mock('@/services/paymentService', () => ({
  paymentService: { createPayment: jest.fn() },
}));

jest.mock('@/services/invoiceService', () => ({
  invoiceService: { fetchInvoiceById: jest.fn() },
}));

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
    resetPaymentAttemptStore();
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

  it('shows the server balance after PAYMENT_EXCEEDS_BALANCE and keeps the entered amount', async () => {
    const refreshed = { ...invoice, balanceDue: 40, balanceDueText: '40.00' };
    const onSubmit = jest.fn()
      .mockRejectedValueOnce(new PaymentExceedsBalanceError(
        refreshed,
        new AuthApiError('Payment exceeds invoice balance', 400, 'PAYMENT_EXCEEDS_BALANCE'),
      ))
      .mockResolvedValueOnce(undefined);
    const screen = renderModal(onSubmit);
    fireEvent.changeText(screen.getByLabelText('Payment amount'), '25.00');
    fireEvent.changeText(screen.getByLabelText('Payment reference'), 'REF-1');

    fireEvent.press(screen.getByLabelText('Record payment'));
    expect(await screen.findByText(/more than the balance due/i)).toBeTruthy();
    expect(screen.getByLabelText('Payment amount').props.value).toBe('25.00');
    expect(screen.getByText('$40.00')).toBeTruthy();
    expect(screen.queryByText('$50.00')).toBeNull();
    expect(screen.getByLabelText('Payment reference').props.value).toBe('REF-1');
    const key = onSubmit.mock.calls[0]?.[1];
    expect(onSubmit.mock.calls[0]?.[0].amount).toBe('25.00');

    fireEvent.press(screen.getByLabelText('Record payment'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit.mock.calls[1]?.[1]).toBe(key);
    expect(onSubmit.mock.calls[1]?.[0].amount).toBe('25.00');
    expect(onSubmit.mock.calls[1]?.[0].referenceNumber).toBe('REF-1');
  });

  it('keeps an amount that is now over the refreshed balance so it can be corrected', async () => {
    const refreshed = { ...invoice, balanceDue: 40, balanceDueText: '40.00' };
    const onSubmit = jest.fn().mockRejectedValueOnce(new PaymentExceedsBalanceError(
      refreshed,
      new AuthApiError('Payment exceeds invoice balance', 400, 'PAYMENT_EXCEEDS_BALANCE'),
    ));
    const screen = renderModal(onSubmit);

    fireEvent.press(screen.getByLabelText('Record payment'));
    expect(await screen.findByText(/more than the balance due/i)).toBeTruthy();
    expect(screen.getByLabelText('Payment amount').props.value).toBe('50.00');
    expect(screen.getByText('$40.00')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Record payment'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Amount cannot exceed the balance due.')).toBeTruthy();
  });

  it('reuses the idempotency key when the sheet is dismissed and reopened after a timeout', async () => {
    const onSubmit = jest.fn()
      .mockRejectedValueOnce(new Error('The request timed out'))
      .mockResolvedValueOnce(undefined);
    const props = { invoice, onSubmit, onClose: jest.fn() };
    const screen = render(<PaymentCaptureModal visible {...props} />);

    fireEvent.press(screen.getByLabelText('Record payment'));
    expect(await screen.findByText(/timed out/i)).toBeTruthy();
    const key = onSubmit.mock.calls[0]?.[1];
    screen.unmount();

    const reopened = render(<PaymentCaptureModal visible {...props} />);
    fireEvent.press(reopened.getByLabelText('Record payment'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit.mock.calls[1]?.[1]).toBe(key);
    expect(onSubmit.mock.calls[1]?.[0].amount).toBe('50.00');
  });

  it('does not reset the idempotency key when balanceDueText changes', async () => {
    const onSubmit = jest.fn()
      .mockRejectedValueOnce(new Error('The request timed out'))
      .mockResolvedValueOnce(undefined);
    const screen = render(
      <PaymentCaptureModal visible invoice={invoice} onSubmit={onSubmit} onClose={jest.fn()} />,
    );
    fireEvent.changeText(screen.getByLabelText('Payment amount'), '25.00');
    fireEvent.changeText(screen.getByLabelText('Payment reference'), 'REF-9');
    fireEvent.press(screen.getByLabelText('Record payment'));
    expect(await screen.findByText(/timed out/i)).toBeTruthy();
    const key = onSubmit.mock.calls[0]?.[1];

    screen.rerender(
      <PaymentCaptureModal
        visible
        invoice={{ ...invoice, balanceDue: 40, balanceDueText: '40.00' }}
        onSubmit={onSubmit}
        onClose={jest.fn()}
      />,
    );
    expect(screen.getByLabelText('Payment amount').props.value).toBe('25.00');
    expect(screen.getByText('$40.00')).toBeTruthy();
    expect(screen.getByLabelText('Payment reference').props.value).toBe('REF-9');

    fireEvent.press(screen.getByLabelText('Record payment'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit.mock.calls[1]?.[1]).toBe(key);
    expect(onSubmit.mock.calls[1]?.[0].amount).toBe('25.00');
    expect(onSubmit.mock.calls[1]?.[0].referenceNumber).toBe('REF-9');
  });

  it('reuses the idempotency key for the edited attempt when the sheet is hidden and opened again', async () => {
    const onSubmit = jest.fn()
      .mockRejectedValueOnce(new Error('The request timed out'))
      .mockResolvedValueOnce(undefined);
    const props = { invoice, onSubmit, onClose: jest.fn() };
    const screen = render(<PaymentCaptureModal visible {...props} />);
    fireEvent.changeText(screen.getByLabelText('Payment amount'), '25.00');
    fireEvent.changeText(screen.getByLabelText('Payment reference'), 'REF-1');
    fireEvent.press(screen.getByLabelText('Record payment'));
    expect(await screen.findByText(/timed out/i)).toBeTruthy();
    const key = onSubmit.mock.calls[0]?.[1];

    screen.rerender(<PaymentCaptureModal visible={false} {...props} />);
    screen.rerender(<PaymentCaptureModal visible invoice={{ ...invoice, balanceDue: 40, balanceDueText: '40.00' }} onSubmit={onSubmit} onClose={props.onClose} />);

    expect(screen.getByLabelText('Payment amount').props.value).toBe('25.00');
    expect(screen.getByLabelText('Payment reference').props.value).toBe('REF-1');
    expect(screen.getByText('$40.00')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Record payment'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit.mock.calls[1]?.[1]).toBe(key);
    expect(onSubmit.mock.calls[1]?.[0].amount).toBe('25.00');
    expect(onSubmit.mock.calls[1]?.[0].referenceNumber).toBe('REF-1');
  });

  it('rejects more than 2 decimal places before claiming a payment attempt', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const screen = renderModal(onSubmit);

    for (const value of ['10.004', '10.005', '9.996']) {
      fireEvent.changeText(screen.getByLabelText('Payment amount'), value);
      fireEvent.press(screen.getByLabelText('Record payment'));
      expect(screen.getByText(/2 decimal places/i)).toBeTruthy();
      expect(onSubmit).not.toHaveBeenCalled();
      expect(pendingPaymentAttempt(invoice.id)).toBeNull();
    }

    fireEvent.changeText(screen.getByLabelText('Payment amount'), '10.5');
    fireEvent.press(screen.getByLabelText('Record payment'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByLabelText('Record payment').props.accessibilityState.disabled).toBe(false));
    expect(onSubmit.mock.calls[0]?.[0].amount).toBe('10.50');

    fireEvent.changeText(screen.getByLabelText('Payment amount'), '10.50');
    fireEvent.press(screen.getByLabelText('Record payment'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit.mock.calls[1]?.[0].amount).toBe('10.50');
  });

  it('does not send a second payment when the sheet is dismissed and reopened before the first request settles', async () => {
    let resolveSubmit: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => { resolveSubmit = resolve; });
    const onSubmit = jest.fn().mockImplementation(() => pending);
    const props = { invoice, onSubmit, onClose: jest.fn() };
    const screen = render(<PaymentCaptureModal visible {...props} />);

    fireEvent.press(screen.getByLabelText('Record payment'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const firstKey = onSubmit.mock.calls[0]?.[1];
    screen.UNSAFE_getByType(Modal).props.onRequestClose();
    expect(props.onClose).not.toHaveBeenCalled();

    screen.rerender(<PaymentCaptureModal visible={false} {...props} />);
    screen.unmount();

    const reopened = render(<PaymentCaptureModal visible {...props} />);
    fireEvent.changeText(reopened.getByLabelText('Payment amount'), '25.00');
    fireEvent.press(reopened.getByLabelText('Record payment'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(reopened.getByText(/already being recorded/i)).toBeTruthy();

    resolveSubmit?.();
    await act(async () => { await pending; });
    fireEvent.press(reopened.getByLabelText('Record payment'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit.mock.calls[1]?.[0].amount).toBe('25.00');
    expect(onSubmit.mock.calls[1]?.[1]).not.toBe(firstKey);
  });
});

function ListPaymentSheet({ client, initial }: { client: QueryClient; initial: Invoice }) {
  const [current, setCurrent] = useState(initial);
  return (
    <PaymentCaptureModal
      visible
      invoice={current}
      onClose={jest.fn()}
      onSubmit={async (payment, idempotencyKey) => {
        await submitInvoicePayment(client, payment, idempotencyKey, (fresh) => {
          setCurrent(fresh);
        });
      }}
    />
  );
}

describe('invoice list payment sheet', () => {
  beforeEach(() => {
    onlineManager.setOnline(true);
    resetPaymentAttemptStore();
    jest.clearAllMocks();
  });

  it('replaces the stale list balance after PAYMENT_EXCEEDS_BALANCE and keeps the typed amount', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
    });
    client.setQueryData(['invoices', 'detail', invoice.id], { ...invoice, balanceDueText: '50.00' });
    jest.mocked(paymentService.createPayment).mockRejectedValue(
      new AuthApiError('Payment exceeds invoice balance', 400, 'PAYMENT_EXCEEDS_BALANCE'),
    );
    jest.mocked(invoiceService.fetchInvoiceById).mockResolvedValue({
      ...invoice,
      balanceDue: 40,
      balanceDueText: '40.00',
    });
    const screen = render(<ListPaymentSheet client={client} initial={invoice} />);
    fireEvent.changeText(screen.getByLabelText('Payment amount'), '45.00');
    fireEvent.changeText(screen.getByLabelText('Payment reference'), 'REF-LIST');

    fireEvent.press(screen.getByLabelText('Record payment'));

    expect(await screen.findByText(/more than the balance due/i)).toBeTruthy();
    expect(invoiceService.fetchInvoiceById).toHaveBeenCalledWith(invoice.id);
    expect(screen.getByText('$40.00')).toBeTruthy();
    expect(screen.queryByText('$50.00')).toBeNull();
    expect(screen.getByLabelText('Payment amount').props.value).toBe('45.00');
    expect(screen.getByLabelText('Payment reference').props.value).toBe('REF-LIST');
    expect(screen.getByText('Amount cannot exceed the balance due.')).toBeTruthy();
  });
});
