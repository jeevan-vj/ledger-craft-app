import React, { useState } from 'react';
import { createPaymentRequestSchema } from '@ledgercraft/contracts';
import { pendingMutation } from '@/features/accounting/pendingMutation';
import * as SecureStore from 'expo-secure-store';
import { Modal } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { onlineManager, QueryClient } from '@tanstack/react-query';
import { AuthApiError } from '@/features/auth/api/http';
import { PaymentExceedsBalanceError, pendingPaymentAttempt, resetPaymentAttemptStore } from '@/features/payments/paymentModel';
import { submitInvoicePayment } from '@/features/payments/paymentQueries';
import { invoiceService } from '@/services/invoiceService';
import { paymentService } from '@/services/paymentService';
import { mockInvoice } from '@/__tests__/fixtures/invoice.fixtures';
import type { CreatePaymentRequest } from '@/types/payment';
import type { Invoice } from '@/types/invoice';
import PaymentCaptureModal from './PaymentCaptureModal';
import { currencyApi } from '@/features/currency/currencyApi';

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
    <PaymentCaptureModal ownerId="owner-a" visible invoice={invoice} onSubmit={onSubmit} onClose={jest.fn()} />,
  );
  return { ...view, onSubmit };
}

function paymentButton(view: Pick<ReturnType<typeof render>, 'getByLabelText' | 'queryByLabelText'>) {
  return view.queryByLabelText('Resume pending payment') ?? view.getByLabelText('Record payment');
}

const durablePayments = new Map<string, string>();
beforeEach(() => {
  durablePayments.clear();
  jest.mocked(SecureStore.getItemAsync).mockImplementation(async (key) => durablePayments.get(key) ?? null);
  jest.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => { durablePayments.set(key, value); });
  jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async (key) => { durablePayments.delete(key); });
});

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

    fireEvent.press(paymentButton(screen));
    expect(await screen.findByText(/offline/i)).toBeTruthy();
    expect(screen.getByText(/will not be sent later/i)).toBeTruthy();
    const firstKey = onSubmit.mock.calls[0]?.[1];

    fireEvent.press(paymentButton(screen));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit.mock.calls[1]?.[1]).toBe(firstKey);
    expect(onSubmit.mock.calls[1]?.[0].amount).toBe('50.00');
    expect(paymentButton(screen).props.accessibilityState.disabled).toBe(true);

    fireEvent.press(paymentButton(screen));
    expect(onSubmit).toHaveBeenCalledTimes(2);
    resolveSubmit?.();
    await waitFor(() => expect(paymentButton(screen).props.accessibilityState.disabled).toBe(false));
  });

  it('mints a new key after the form changes and after a successful submit', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const screen = renderModal(onSubmit);

    fireEvent.press(paymentButton(screen));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(paymentButton(screen).props.accessibilityState.disabled).toBe(false));
    const firstKey = onSubmit.mock.calls[0]?.[1];

    fireEvent.press(paymentButton(screen));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit.mock.calls[1]?.[1]).not.toBe(firstKey);

    fireEvent.changeText(screen.getByLabelText('Payment amount'), '25.00');
    fireEvent.press(paymentButton(screen));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(3));
    expect(onSubmit.mock.calls[2]?.[1]).not.toBe(onSubmit.mock.calls[1]?.[1]);
    expect(onSubmit.mock.calls[2]?.[0].amount).toBe('25.00');
  });

  it('clears a definitively rejected attempt but retains an idempotency conflict key for review', async () => {
    const onSubmit = jest.fn()
      .mockRejectedValueOnce(new AuthApiError('Payment exceeds invoice balance', 400, 'PAYMENT_EXCEEDS_BALANCE'))
      .mockRejectedValueOnce(new AuthApiError('Idempotency-Key was reused with a different request', 409, 'IDEMPOTENCY_CONFLICT'))
      .mockResolvedValueOnce(undefined);
    const screen = renderModal(onSubmit);

    fireEvent.press(paymentButton(screen));
    expect(await screen.findByText(/more than the balance due/i)).toBeTruthy();
    const balanceKey = onSubmit.mock.calls[0]?.[1];

    fireEvent.press(paymentButton(screen));
    expect(await screen.findByText(/different request/i)).toBeTruthy();
    const conflictKey = onSubmit.mock.calls[1]?.[1];
    expect(conflictKey).not.toBe(balanceKey);

    fireEvent.press(paymentButton(screen));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(3));
    expect(onSubmit.mock.calls[2]?.[1]).toBe(conflictKey);
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

    fireEvent.press(paymentButton(screen));
    expect(await screen.findByText(/more than the balance due/i)).toBeTruthy();
    expect(screen.getByLabelText('Payment amount').props.value).toBe('25.00');
    expect(screen.getByText('$40.00')).toBeTruthy();
    expect(screen.queryByText('$50.00')).toBeNull();
    expect(screen.getByLabelText('Payment reference').props.value).toBe('REF-1');
    const key = onSubmit.mock.calls[0]?.[1];
    expect(onSubmit.mock.calls[0]?.[0].amount).toBe('25.00');

    fireEvent.press(paymentButton(screen));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit.mock.calls[1]?.[1]).not.toBe(key);
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

    fireEvent.press(paymentButton(screen));
    expect(await screen.findByText(/more than the balance due/i)).toBeTruthy();
    expect(screen.getByLabelText('Payment amount').props.value).toBe('50.00');
    expect(screen.getByText('$40.00')).toBeTruthy();

    fireEvent.press(paymentButton(screen));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Amount cannot exceed the balance due.')).toBeTruthy();
  });

  it('reuses the idempotency key when the sheet is dismissed and reopened after a timeout', async () => {
    const onSubmit = jest.fn()
      .mockRejectedValueOnce(new Error('The request timed out'))
      .mockResolvedValueOnce(undefined);
    const props = { invoice, onSubmit, onClose: jest.fn() };
    const screen = render(<PaymentCaptureModal ownerId="owner-a" visible {...props} />);

    fireEvent.press(paymentButton(screen));
    expect(await screen.findByText(/timed out/i)).toBeTruthy();
    const key = onSubmit.mock.calls[0]?.[1];
    screen.unmount();

    const reopened = render(<PaymentCaptureModal ownerId="owner-a" visible {...props} />);
    await reopened.findByLabelText('Resume pending payment');
    fireEvent.press(paymentButton(reopened));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit.mock.calls[1]?.[1]).toBe(key);
    expect(onSubmit.mock.calls[1]?.[0].amount).toBe('50.00');
  });

  it('does not reset the idempotency key when balanceDueText changes', async () => {
    const onSubmit = jest.fn()
      .mockRejectedValueOnce(new Error('The request timed out'))
      .mockResolvedValueOnce(undefined);
    const screen = render(
      <PaymentCaptureModal ownerId="owner-a" visible invoice={invoice} onSubmit={onSubmit} onClose={jest.fn()} />,
    );
    fireEvent.changeText(screen.getByLabelText('Payment amount'), '25.00');
    fireEvent.changeText(screen.getByLabelText('Payment reference'), 'REF-9');
    fireEvent.press(paymentButton(screen));
    expect(await screen.findByText(/timed out/i)).toBeTruthy();
    const key = onSubmit.mock.calls[0]?.[1];

    screen.rerender(
      <PaymentCaptureModal ownerId="owner-a"
        visible
        invoice={{ ...invoice, balanceDue: 40, balanceDueText: '40.00' }}
        onSubmit={onSubmit}
        onClose={jest.fn()}
      />,
    );
    expect(screen.getByLabelText('Payment amount').props.value).toBe('25.00');
    expect(screen.getByText('$40.00')).toBeTruthy();
    expect(screen.getByLabelText('Payment reference').props.value).toBe('REF-9');

    fireEvent.press(paymentButton(screen));
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
    const screen = render(<PaymentCaptureModal ownerId="owner-a" visible {...props} />);
    fireEvent.changeText(screen.getByLabelText('Payment amount'), '25.00');
    fireEvent.changeText(screen.getByLabelText('Payment reference'), 'REF-1');
    fireEvent.press(paymentButton(screen));
    expect(await screen.findByText(/timed out/i)).toBeTruthy();
    const key = onSubmit.mock.calls[0]?.[1];

    screen.rerender(<PaymentCaptureModal ownerId="owner-a" visible={false} {...props} />);
    screen.rerender(<PaymentCaptureModal ownerId="owner-a" visible invoice={{ ...invoice, balanceDue: 40, balanceDueText: '40.00' }} onSubmit={onSubmit} onClose={props.onClose} />);

    await screen.findByLabelText('Resume pending payment');
    expect(screen.getByLabelText('Payment amount').props.value).toBe('25.00');
    expect(screen.getByLabelText('Payment reference').props.value).toBe('REF-1');
    expect(screen.getByText('$40.00')).toBeTruthy();
    fireEvent.press(paymentButton(screen));
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
      fireEvent.press(paymentButton(screen));
      expect(screen.getByText(/2 decimal places/i)).toBeTruthy();
      expect(onSubmit).not.toHaveBeenCalled();
      expect(pendingPaymentAttempt(invoice.id)).toBeNull();
    }

    fireEvent.changeText(screen.getByLabelText('Payment amount'), '10.5');
    fireEvent.press(paymentButton(screen));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(paymentButton(screen).props.accessibilityState.disabled).toBe(false));
    expect(onSubmit.mock.calls[0]?.[0].amount).toBe('10.50');

    fireEvent.changeText(screen.getByLabelText('Payment amount'), '10.50');
    fireEvent.press(paymentButton(screen));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit.mock.calls[1]?.[0].amount).toBe('10.50');
  });

  it('does not send a second payment when the sheet is dismissed and reopened before the first request settles', async () => {
    let resolveSubmit: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => { resolveSubmit = resolve; });
    const onSubmit = jest.fn().mockImplementation(() => pending);
    const props = { invoice, onSubmit, onClose: jest.fn() };
    const screen = render(<PaymentCaptureModal ownerId="owner-a" visible {...props} />);

    fireEvent.press(paymentButton(screen));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const firstKey = onSubmit.mock.calls[0]?.[1];
    screen.UNSAFE_getByType(Modal).props.onRequestClose();
    expect(props.onClose).not.toHaveBeenCalled();

    screen.rerender(<PaymentCaptureModal ownerId="owner-a" visible={false} {...props} />);
    screen.unmount();

    const reopened = render(<PaymentCaptureModal ownerId="owner-a" visible {...props} />);
    await reopened.findByLabelText('Resume pending payment');
    expect(reopened.getByLabelText('Payment amount').props.editable).toBe(false);
    fireEvent.press(paymentButton(reopened));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(await reopened.findByText(/already being recorded/i)).toBeTruthy();

    resolveSubmit?.();
    await act(async () => { await pending; });
    fireEvent.press(paymentButton(reopened));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit.mock.calls[1]?.[0].amount).toBe('50.00');
    expect(onSubmit.mock.calls[1]?.[1]).toBe(firstKey);
  });
});

function ListPaymentSheet({ client, initial }: { client: QueryClient; initial: Invoice }) {
  const [current, setCurrent] = useState(initial);
  return (
    <PaymentCaptureModal ownerId="owner-a"
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
  let listClient: QueryClient | undefined;
  afterEach(() => { listClient?.clear(); listClient = undefined; });
  beforeEach(() => {
    onlineManager.setOnline(true);
    resetPaymentAttemptStore();
    jest.clearAllMocks();
  });

  it('replaces the stale list balance after PAYMENT_EXCEEDS_BALANCE and keeps the typed amount', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
    });
    listClient = client;
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

    fireEvent.press(paymentButton(screen));

    expect(await screen.findByText(/more than the balance due/i)).toBeTruthy();
    expect(invoiceService.fetchInvoiceById).toHaveBeenCalledWith(invoice.id);
    expect(screen.getByText('$40.00')).toBeTruthy();
    expect(screen.queryByText('$50.00')).toBeNull();
    expect(screen.getByLabelText('Payment amount').props.value).toBe('45.00');
    expect(screen.getByLabelText('Payment reference').props.value).toBe('REF-LIST');
    expect(screen.getByText('Amount cannot exceed the balance due.')).toBeTruthy();
  });
});

it('submits the document-currency100 with the selected reviewed1.65 rate instead of converting the amount on device', async () => {
  resetPaymentAttemptStore();
  const onSubmit=jest.fn().mockResolvedValue(undefined);
  const rates=jest.spyOn(currencyApi,'get').mockResolvedValue({rates:[{id:'55555555-5555-4555-8555-555555555555',currencyCode:'USD',baseCurrency:'NZD',effectiveDate:'2026-11-01',rate:'1.650000'}]} as never);
  const screen=render(<PaymentCaptureModal ownerId="owner-a" visible invoice={{...invoice,currency:'USD',balanceDueText:'100.00'}} onSubmit={onSubmit} onClose={jest.fn()}/>);
  fireEvent.press(await screen.findByText('1 USD = 1.650000 NZD · 2026-11-01'));
  fireEvent.press(paymentButton(screen));
  await waitFor(()=>expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({amount:'100.00',exchangeRateId:'55555555-5555-4555-8555-555555555555'}),expect.any(String)));
  rates.mockRestore();
});

describe('durable invoice payment recovery', () => {
  beforeEach(() => { onlineManager.setOnline(true); resetPaymentAttemptStore(); });
  it('recovers a lost201 after cold restart and retries the same body/key even when the invoice is now paid', async () => {
    const committed = new Map<string, CreatePaymentRequest>();
    let first = true;
    const onSubmit = jest.fn(async (body: CreatePaymentRequest, key: string) => {
      if (!committed.has(key)) committed.set(key, body);
      if (first) { first = false; throw new Error('Connection lost after server accepted payment'); }
    });
    const view = render(<PaymentCaptureModal ownerId="owner-a" visible invoice={invoice} onSubmit={onSubmit} onClose={jest.fn()} />);
    fireEvent.changeText(view.getByLabelText('Payment amount'), '25.00');
    fireEvent.changeText(view.getByLabelText('Payment reference'), 'BANK-LOST-201');
    fireEvent.press(view.getByLabelText('Record payment'));
    await view.findByText(/Connection lost/);
    const [originalBody, originalKey] = onSubmit.mock.calls[0]!;
    expect(committed.size).toBe(1);
    view.unmount(); resetPaymentAttemptStore();
    const reopened = render(<PaymentCaptureModal ownerId="owner-a" visible invoice={{ ...invoice, status: 'paid', balanceDue: 0, balanceDueText: '0.00' }} onSubmit={onSubmit} onClose={jest.fn()} />);
    const resume = await reopened.findByLabelText('Resume pending payment');
    expect(reopened.getByLabelText('Payment amount').props.value).toBe('25.00');
    expect(reopened.getByLabelText('Payment amount').props.editable).toBe(false);
    fireEvent.press(resume);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit.mock.calls[1]).toEqual([originalBody, originalKey]);
    await waitFor(() => expect(durablePayments.size).toBe(0));
    expect(committed.size).toBe(1);
  });
  it('retains an uncertain key after a later401 and another remount', async () => {
    const onSubmit = jest.fn().mockRejectedValueOnce(new Error('Timeout after transmission')).mockRejectedValueOnce(new AuthApiError('Sign in again', 401, 'UNAUTHORIZED')).mockResolvedValueOnce(undefined);
    const props = { ownerId: 'owner-a', visible: true, invoice, onSubmit, onClose: jest.fn() };
    const view = render(<PaymentCaptureModal {...props} />);
    fireEvent.press(view.getByLabelText('Record payment')); await view.findByText(/Timeout after transmission/);
    const firstKey = onSubmit.mock.calls[0][1];
    view.unmount(); resetPaymentAttemptStore();
    const second = render(<PaymentCaptureModal {...props} />);
    fireEvent.press(await second.findByLabelText('Resume pending payment'));
    await second.findByText(/Sign in again/);
    expect(durablePayments.size).toBe(1);
    second.unmount(); resetPaymentAttemptStore();
    const third = render(<PaymentCaptureModal {...props} />);
    fireEvent.press(await third.findByLabelText('Resume pending payment'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(3));
    expect(onSubmit.mock.calls[1][1]).toBe(firstKey);
    expect(onSubmit.mock.calls[2][1]).toBe(firstKey);
  });
  it('treats a persisted pre-catch crash as uncertain before a later401 can discard its key', async () => {
    const input: CreatePaymentRequest = { invoiceId: invoice.id, paymentMethod: 'bank_transfer', amount: '25.00', paymentDate: '2026-11-02', referenceNumber: 'CRASH-BEFORE-CATCH', notes: null };
    const pending = await pendingMutation.claim('owner-a', `invoice-payment.${invoice.id}`, input, (value) => createPaymentRequestSchema.parse(value));
    expect(pending.uncertain).toBe(false);
    const onSubmit = jest.fn().mockRejectedValueOnce(new AuthApiError('Sign in after restart', 401, 'UNAUTHORIZED')).mockResolvedValueOnce(undefined);
    const view = render(<PaymentCaptureModal ownerId="owner-a" visible invoice={{ ...invoice, status: 'paid', balanceDue: 0, balanceDueText: '0.00' }} onSubmit={onSubmit} onClose={jest.fn()} />);
    fireEvent.press(await view.findByLabelText('Resume pending payment'));
    await view.findByText(/Sign in after restart/);
    expect(durablePayments.size).toBe(1);
    fireEvent.press(view.getByLabelText('Resume pending payment'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit.mock.calls[0]).toEqual([input, pending.key]);
    expect(onSubmit.mock.calls[1]).toEqual([input, pending.key]);
  });
  it('does not expose another actor saved body or reuse their request key', async () => {
    const ownerA = jest.fn().mockRejectedValue(new Error('Owner A outcome unknown'));
    const first = render(<PaymentCaptureModal ownerId="owner-a" visible invoice={invoice} onSubmit={ownerA} onClose={jest.fn()} />);
    fireEvent.changeText(first.getByLabelText('Payment reference'), 'OWNER-A-PRIVATE');
    fireEvent.press(first.getByLabelText('Record payment')); await first.findByText(/Owner A outcome/);
    first.unmount(); resetPaymentAttemptStore();
    const ownerB = jest.fn().mockResolvedValue(undefined);
    const second = render(<PaymentCaptureModal ownerId="owner-b" visible invoice={invoice} onSubmit={ownerB} onClose={jest.fn()} />);
    await waitFor(() => expect(second.getByLabelText('Payment reference').props.value).toBe(''));
    expect(second.queryByLabelText('Resume pending payment')).toBeNull();
    fireEvent.press(second.getByLabelText('Record payment'));
    await waitFor(() => expect(ownerB).toHaveBeenCalledTimes(1));
    expect(ownerB.mock.calls[0][1]).not.toBe(ownerA.mock.calls[0][1]);
    expect(ownerB.mock.calls[0][0].referenceNumber).toBeNull();
    expect(durablePayments.size).toBe(1);
  });
  it('does not transmit a new payment when its durable request cannot be saved', async () => {
    jest.mocked(SecureStore.setItemAsync).mockRejectedValue(new Error('Secure storage unavailable'));
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const view = render(<PaymentCaptureModal ownerId="owner-a" visible invoice={invoice} onSubmit={onSubmit} onClose={jest.fn()} />);
    fireEvent.press(view.getByLabelText('Record payment'));
    expect(await view.findByText(/Secure storage unavailable/)).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
