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

const serverMessage = 'Email delivery is unavailable. Download or share the invoice instead.';

function renderSection(canSend = true) {
  const onShareInstead = jest.fn();
  const onSent = jest.fn();
  const view = render(
    <InvoiceDeliverySection invoice={mockInvoice} canSend={canSend} onShareInstead={onShareInstead} onSent={onSent} />,
  );
  return { ...view, onShareInstead, onSent };
}

beforeEach(() => {
  jest.resetAllMocks();
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

it('does not offer share-link success when send fails offline or the member is read-only', async () => {
  jest.mocked(invoiceService.sendInvoice).mockRejectedValueOnce(
    new AuthApiError("Can't reach the API. Start it with pnpm dev:api (port 3001).", 0),
  );
  const offline = renderSection();
  fireEvent.press(offline.getByLabelText('Send invoice'));
  await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
  const buttons = jest.mocked(Alert.alert).mock.calls[0][2] ?? [];
  expect(buttons.map((button) => button.text)).not.toContain('Share link instead');
  expect(JSON.stringify(jest.mocked(Alert.alert).mock.calls)).not.toContain('Invoice sent');
  expect(offline.onSent).not.toHaveBeenCalled();

  const hidden = renderSection(false);
  expect(hidden.queryByLabelText('Send invoice')).toBeNull();
  expect(hidden.queryByLabelText('Send reminder')).toBeNull();
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
