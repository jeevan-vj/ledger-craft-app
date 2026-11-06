import React from 'react';
import { Share } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { onlineManager } from '@tanstack/react-query';
import { invoiceService } from '@/services/invoiceService';
import { SaleSuccessState } from './SaleSuccessState';

jest.mock('@/services/invoiceService', () => ({ invoiceService: { createShareLink: jest.fn() } }));
const sale = { invoiceId: 'invoice-1', invoiceNumber: 'INV-88', paymentId: 'payment-1', receiptId: 'receipt-1' };
const link = { shareToken: 'paid-sale-token', invoiceId: sale.invoiceId, templateName: 'classic' };

beforeEach(() => {
  jest.clearAllMocks();
  onlineManager.setOnline(true);
  jest.mocked(invoiceService.createShareLink).mockResolvedValue(link as never);
  jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.dismissedAction });
});
afterEach(() => { jest.restoreAllMocks(); });

it('leaves the sale saved without publishing a link when no receipt is wanted', () => {
  const done = jest.fn();
  const screen = render(<SaleSuccessState sale={sale} onDone={done} />);
  expect(screen.getByText('INV-88')).toBeTruthy();
  expect(invoiceService.createShareLink).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('No receipt'));
  expect(done).toHaveBeenCalledTimes(1);
});

it('creates a QR lazily, reuses its link for native sharing, and handles dismissal quietly', async () => {
  const screen = render(<SaleSuccessState sale={sale} onDone={jest.fn()} />);
  fireEvent.press(screen.getByLabelText('Show receipt QR'));
  expect(await screen.findByLabelText('Receipt QR code')).toBeTruthy();
  expect(invoiceService.createShareLink).toHaveBeenCalledWith('invoice-1', 'classic');
  fireEvent.press(screen.getByLabelText('Share receipt'));
  await waitFor(() => expect(Share.share).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('/shared/invoice/paid-sale-token') })));
  expect(invoiceService.createShareLink).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('alert')).toBeNull();
});

it('shows loading, guards repeated taps and allows leaving while a share link loads', async () => {
  jest.mocked(invoiceService.createShareLink).mockImplementation(() => new Promise(() => {}));
  const done = jest.fn();
  const screen = render(<SaleSuccessState sale={sale} onDone={done} />);
  fireEvent.press(screen.getByLabelText('Show receipt QR'));
  expect(await screen.findByLabelText('Creating receipt link')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Share receipt'));
  expect(invoiceService.createShareLink).toHaveBeenCalledTimes(1);
  fireEvent.press(screen.getByLabelText('Done'));
  expect(done).toHaveBeenCalled();
});

it('keeps the successful sale and retries a failed link without creating another sale', async () => {
  jest.mocked(invoiceService.createShareLink).mockRejectedValueOnce(new Error('Network failed'));
  const screen = render(<SaleSuccessState sale={sale} onDone={jest.fn()} />);
  fireEvent.press(screen.getByLabelText('Show receipt QR'));
  expect(await screen.findByRole('alert')).toHaveTextContent('The sale is saved. Check your connection and try the receipt again.');
  expect(screen.getByText('INV-88')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Show receipt QR'));
  expect(await screen.findByLabelText('Receipt QR code')).toBeTruthy();
});

it('does not publish a receipt link while offline', async () => {
  const screen = render(<SaleSuccessState sale={sale} onDone={jest.fn()} />);
  await act(async () => { onlineManager.setOnline(false); });
  fireEvent.press(screen.getByLabelText('Show receipt QR'));
  expect(await screen.findByRole('alert')).toHaveTextContent('The sale is saved. Check your connection and try the receipt again.');
  expect(invoiceService.createShareLink).not.toHaveBeenCalled();
});

it('does not open the previous sale share sheet after leaving during link creation', async () => {
  let resolveLink!: (value: never) => void;
  jest.mocked(invoiceService.createShareLink).mockImplementation(() => new Promise((resolve) => { resolveLink = resolve; }));
  const done = jest.fn();
  const screen = render(<SaleSuccessState sale={sale} onDone={done} />);
  fireEvent.press(screen.getByLabelText('Share receipt'));
  fireEvent.press(screen.getByLabelText('Done'));
  expect(done).toHaveBeenCalled();
  screen.unmount();
  await act(async () => { resolveLink(link as never); });
  expect(Share.share).not.toHaveBeenCalled();
});
