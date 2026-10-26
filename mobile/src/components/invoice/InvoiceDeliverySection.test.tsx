import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { AuthApiError } from '@/features/auth/api/http';
import { invoiceService } from '@/services/invoiceService';
import { mockInvoice } from '@/__tests__/fixtures/invoice.fixtures';
import { InvoiceDeliverySection } from './InvoiceDeliverySection';

jest.mock('@/services/invoiceService', () => ({
  invoiceService: { sendInvoice: jest.fn(), remindInvoice: jest.fn() },
}));
jest.mock('@/services/capabilitiesService', () => ({
  getServerCapabilities: jest.fn(async () => ({ email: 'available', ai: 'unavailable' })),
}));

const serverMessage = 'Email delivery is unavailable. Download or share the invoice instead.';

function renderSection(canSend = true) {
  const onShareInstead = jest.fn();
  const onSent = jest.fn();
  const view = render(
    <InvoiceDeliverySection invoice={mockInvoice} canSend={canSend} emailAvailable onShareInstead={onShareInstead} onSent={onSent} />,
  );
  return { ...view, onShareInstead, onSent };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

it('shows the EMAIL_UNAVAILABLE server message and a share-link action for send and remind', async () => {
  const unavailable = new AuthApiError(serverMessage, 503, 'EMAIL_UNAVAILABLE', 'req-1');
  jest.mocked(invoiceService.sendInvoice).mockRejectedValueOnce(unavailable);
  jest.mocked(invoiceService.remindInvoice).mockRejectedValueOnce(unavailable);
  const view = renderSection();

  fireEvent.press(view.getByLabelText('Send invoice'));
  await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith(
    'Email unavailable',
    serverMessage,
    expect.arrayContaining([expect.objectContaining({ text: 'Share link instead' })]),
  ));
  const sendButtons = jest.mocked(Alert.alert).mock.calls[0][2];
  sendButtons?.find((button) => button.text === 'Share link instead')?.onPress?.();
  expect(view.onShareInstead).toHaveBeenCalledTimes(1);
  expect(view.onSent).not.toHaveBeenCalled();

  fireEvent.press(view.getByLabelText('Send reminder'));
  await waitFor(() => expect(invoiceService.remindInvoice).toHaveBeenCalledWith(
    mockInvoice.id,
    expect.objectContaining({
      subject: expect.stringContaining(mockInvoice.invoiceNumber),
      html: expect.stringContaining(mockInvoice.invoiceNumber),
    }),
  ));
  const remindButtons = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2];
  expect(jest.mocked(Alert.alert).mock.calls.at(-1)?.[1]).toBe(serverMessage);
  remindButtons?.find((button) => button.text === 'Share link instead')?.onPress?.();
  expect(view.onShareInstead).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(jest.mocked(Alert.alert).mock.calls)).not.toContain('Invoice sent');
});

it('shows a connection error when send or remind cannot reach the API', async () => {
  const offlineError = new AuthApiError(
    "Can't reach the API. Start it with pnpm dev:api (port 3001).",
    0,
  );
  jest.mocked(invoiceService.sendInvoice).mockRejectedValueOnce(offlineError);
  jest.mocked(invoiceService.remindInvoice).mockRejectedValueOnce(offlineError);
  const offline = renderSection();

  fireEvent.press(offline.getByLabelText('Send invoice'));
  await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith(
    'Email not sent',
    'Check your connection and try again.',
  ));

  fireEvent.press(offline.getByLabelText('Send reminder'));
  await waitFor(() => expect(jest.mocked(Alert.alert).mock.calls).toHaveLength(2));
  expect(jest.mocked(Alert.alert).mock.calls[1]).toEqual([
    'Email not sent',
    'Check your connection and try again.',
  ]);
  expect(JSON.stringify(jest.mocked(Alert.alert).mock.calls)).not.toMatch(/pnpm|port 3001|Invoice sent|Reminder sent|Share link instead/);
  expect(offline.onSent).not.toHaveBeenCalled();
  expect(offline.onShareInstead).not.toHaveBeenCalled();
});

it('hides send and remind for a read-only member', () => {
  const hidden = renderSection(false);
  expect(hidden.queryByLabelText('Send invoice')).toBeNull();
  expect(hidden.queryByLabelText('Send reminder')).toBeNull();
});

it('proactively offers a share link when email is unavailable', () => {
  const onShareInstead = jest.fn();
  const view = render(<InvoiceDeliverySection invoice={mockInvoice} canSend emailAvailable={false} onShareInstead={onShareInstead} onSent={jest.fn()} />);
  expect(view.getByText('Email isn’t set up on this server yet. Share a secure invoice link instead.')).toBeTruthy();
  fireEvent.press(view.getByLabelText('Share invoice link'));
  expect(onShareInstead).toHaveBeenCalledTimes(1);
  expect(view.queryByLabelText('Send invoice')).toBeNull();
});

it('reports a successful send only after the server accepts it', async () => {
  jest.mocked(invoiceService.sendInvoice).mockResolvedValueOnce(mockInvoice);
  const view = renderSection();
  fireEvent.press(view.getByLabelText('Send invoice'));
  await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith(
    'Invoice sent',
    expect.stringContaining(mockInvoice.invoiceNumber),
  ));
  expect(view.onSent).toHaveBeenCalledTimes(1);
  expect(view.onShareInstead).not.toHaveBeenCalled();
});
