import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert, Share, StyleSheet } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { mockInvoice } from '@/__tests__/fixtures/invoice.fixtures';
import { invoiceService } from '@/services/invoiceService';
import { downloadInvoicePDF, shareInvoicePDF } from '@/utils/pdfUtils';
import InvoiceShareActions from './InvoiceShareActions';

jest.mock('@/services/invoiceService', () => ({ invoiceService: {
  createShareLink: jest.fn(), listShareLinks: jest.fn(), revokeShareLinks: jest.fn(),
} }));
jest.mock('@/utils/pdfUtils', () => ({ downloadInvoicePDF: jest.fn(), shareInvoicePDF: jest.fn() }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 20, left: 0, right: 0 }) }));

const existing = { shareToken: 'private-existing-token', templateName: 'classic', expiresAt: null, isActive: true, accessCount: 2, createdAt: '2026-10-25T00:00:00Z' };
function setup(props: { canManageShares?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return { client, ...render(<QueryClientProvider client={client}><InvoiceShareActions visible invoice={mockInvoice} canManageShares={props.canManageShares} onClose={jest.fn()} /></QueryClientProvider>) };
}
async function confirm(title: string) {
  const call = jest.mocked(Alert.alert).mock.calls.findLast(([message]) => message === title);
  await act(async () => { call?.[2]?.find((button) => button.style === 'destructive')?.onPress?.(); });
}

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(invoiceService.listShareLinks).mockResolvedValue([existing]);
  jest.mocked(invoiceService.createShareLink).mockResolvedValue(existing);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.dismissedAction });
});

afterEach(() => jest.restoreAllMocks());

it('loads the current server link and copies/shares it without creating a snapshot; cancellation is quiet', async () => {
  const view = setup();
  await view.findByText('Active · No expiry');
  expect(view.getByText(/private-existing-token/)).toBeVisible();
  fireEvent.press(view.getByLabelText('Copy link'));
  await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalledWith(expect.stringContaining(existing.shareToken)));
  jest.mocked(Alert.alert).mockClear();
  fireEvent.press(view.getByLabelText('Share link'));
  await waitFor(() => expect(Share.share).toHaveBeenCalled());
  expect(invoiceService.createShareLink).not.toHaveBeenCalled();
  expect(Alert.alert).not.toHaveBeenCalled();
  expect(StyleSheet.flatten(view.getByLabelText('Share link').props.style)).toMatchObject({ flexDirection: 'row', minHeight: 72, width: '100%' });
});

it('confirms replacement, publishes current details and shows actual returned expiry', async () => {
  const expiry = '2099-10-26T12:00:00.000Z';
  jest.mocked(invoiceService.createShareLink).mockResolvedValue({ ...existing, shareToken: 'replacement-token', expiresAt: expiry });
  const view = setup();
  await view.findByText('Active · No expiry');
  fireEvent.press(view.getByLabelText('Replace link'));
  expect(invoiceService.createShareLink).not.toHaveBeenCalled();
  await confirm('Replace link?');
  expect(invoiceService.createShareLink).toHaveBeenCalledWith(mockInvoice.id, 'classic', { replace: true, expiresAt: null });
  await view.findByText(/replacement-token/);
  expect(view.queryByText(/private-existing-token/)).toBeNull();
  expect(view.getByText(`Active · Expires ${new Date(expiry).toLocaleString()}`)).toBeVisible();
});

it('confirms revoke for all templates and removes the old link after success', async () => {
  jest.mocked(invoiceService.revokeShareLinks).mockResolvedValue({ revoked: 2 });
  const view = setup();
  await view.findByText('Active · No expiry');
  fireEvent.press(view.getByLabelText('Revoke all links'));
  expect(invoiceService.revokeShareLinks).not.toHaveBeenCalled();
  await confirm('Revoke all links?');
  expect(invoiceService.revokeShareLinks).toHaveBeenCalledWith(mockInvoice.id);
  await view.findByText('Access revoked. Existing links no longer work.');
  expect(view.queryByLabelText('Copy link')).toBeNull();
  expect(view.queryByText(/private-existing-token/)).toBeNull();
});

it('shows load failure with retry, never treating a failed load as no active link', async () => {
  jest.mocked(invoiceService.listShareLinks).mockRejectedValueOnce(new Error('secret-token failure'));
  const view = setup();
  await view.findByText('Unable to load sharing status. Please retry.');
  expect(view.getByLabelText('Share link')).toBeDisabled();
  expect(view.queryByText('No active link')).toBeNull();
  fireEvent.press(view.getByLabelText('Retry sharing status'));
  await view.findByText('Active · No expiry');
});

it('retains current link after revoke failure, allows retry, and never exposes raw error tokens', async () => {
  jest.mocked(invoiceService.revokeShareLinks).mockRejectedValueOnce(new Error('https://site/shared/invoice/secret-token')).mockResolvedValueOnce({ revoked: 1 });
  const view = setup();
  await view.findByText('Active · No expiry');
  fireEvent.press(view.getByLabelText('Revoke all links'));
  await confirm('Revoke all links?');
  await view.findByText('Unable to complete action. Please try again.');
  expect(JSON.stringify(jest.mocked(Alert.alert).mock.calls)).not.toContain('secret-token');
  expect(view.getByText(/private-existing-token/)).toBeVisible();
  fireEvent.press(view.getByLabelText('Revoke all links'));
  await confirm('Revoke all links?');
  await view.findByText('Access revoked. Existing links no longer work.');
});

it('creates with no expiry by default and preserves PDF actions and export cancellation', async () => {
  jest.mocked(invoiceService.listShareLinks).mockResolvedValue([]);
  jest.mocked(downloadInvoicePDF).mockResolvedValue(null);
  const view = setup();
  await view.findByText('No active link');
  fireEvent.press(view.getByLabelText('Share link'));
  await waitFor(() => expect(invoiceService.createShareLink).toHaveBeenCalledWith(mockInvoice.id, 'classic'));
  await view.findByText('Active · No expiry');
  await waitFor(() => expect(view.getByLabelText('Download PDF')).not.toBeDisabled());
  fireEvent.press(view.getByLabelText('Download PDF'));
  await waitFor(() => expect(downloadInvoicePDF).toHaveBeenCalledWith(mockInvoice, undefined, 'classic'));
  expect(Alert.alert).not.toHaveBeenCalled();
  await waitFor(() => expect(view.getByLabelText('Share PDF')).not.toBeDisabled());
  fireEvent.press(view.getByLabelText('Share PDF'));
  await waitFor(() => expect(shareInvoicePDF).toHaveBeenCalledWith(mockInvoice, undefined, 'classic'));
});

it('uses the matching template and keeps revoke available for links belonging to other templates', async () => {
  jest.mocked(invoiceService.listShareLinks).mockResolvedValue([{ ...existing, templateName: 'modern' }]);
  const view = setup();
  await view.findByText('No active link for this template');
  expect(view.getByLabelText('Replace link')).toBeVisible();
  expect(view.queryByText(/private-existing-token/)).toBeNull();
  expect(view.getByLabelText('Revoke all links')).toBeVisible();
  fireEvent.press(view.getByLabelText('Share link'));
  await waitFor(() => expect(invoiceService.createShareLink).toHaveBeenCalledWith(mockInvoice.id, 'classic'));
});

it('cancelling destructive confirmation makes no request', async () => {
  const view = setup();
  await view.findByText('Active · No expiry');
  fireEvent.press(view.getByLabelText('Replace link'));
  const buttons = jest.mocked(Alert.alert).mock.calls[0][2];
  expect(buttons?.find((button) => button.text === 'Cancel')?.style).toBe('cancel');
  expect(invoiceService.createShareLink).not.toHaveBeenCalled();
  expect(invoiceService.revokeShareLinks).not.toHaveBeenCalled();
});

it('reconciles uncertain mutation outcomes before allowing the old link to be used again', async () => {
  jest.mocked(invoiceService.listShareLinks).mockResolvedValueOnce([existing]).mockResolvedValueOnce([]);
  jest.mocked(invoiceService.revokeShareLinks).mockRejectedValueOnce(new Error('Response lost after server committed'));
  const view = setup();
  await view.findByText('Active · No expiry');
  fireEvent.press(view.getByLabelText('Revoke all links'));
  await confirm('Revoke all links?');
  await view.findByText('No active link');
  expect(view.queryByLabelText('Copy link')).toBeNull();
  expect(invoiceService.listShareLinks).toHaveBeenCalledTimes(2);
});

it('does not restore a revoked token when an older status response arrives after the mutation', async () => {
  let resolveList!: (value: typeof existing[]) => void;
  let resolveRevoke!: (value: { revoked: number }) => void;
  jest.mocked(invoiceService.listShareLinks).mockResolvedValueOnce([existing]).mockImplementationOnce(() => new Promise((resolve) => { resolveList = resolve; }));
  jest.mocked(invoiceService.revokeShareLinks).mockImplementationOnce(() => new Promise((resolve) => { resolveRevoke = resolve; }));
  const view = setup();
  await view.findByText('Active · No expiry');
  fireEvent.press(view.getByLabelText('Revoke all links'));
  await confirm('Revoke all links?');
  // Simulate an already scheduled background refresh while mutation is pending.
  act(() => { void view.client.refetchQueries({ queryKey: ['invoice-shares', mockInvoice.id] }); });
  await act(async () => { resolveRevoke({ revoked: 1 }); });
  await view.findByText('Access revoked. Existing links no longer work.');
  await act(async () => { resolveList([existing]); });
  await waitFor(() => expect(view.client.getQueryState(['invoice-shares', mockInvoice.id])?.fetchStatus).toBe('idle'));
  expect(view.client.getQueryData(['invoice-shares', mockInvoice.id])).toEqual([]);
  expect(view.queryByText('Active · No expiry')).toBeNull();
  expect(view.queryByLabelText('Copy link')).toBeNull();
});

it('blocks cached links when both replacement response and reconciliation fail, then recovers by retrying status', async () => {
  jest.mocked(invoiceService.listShareLinks)
    .mockResolvedValueOnce([existing])
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce([{ ...existing, shareToken: 'server-replacement-token' }]);
  jest.mocked(invoiceService.createShareLink).mockRejectedValueOnce(new Error('response lost'));
  const view = setup();
  await view.findByText('Active · No expiry');
  fireEvent.press(view.getByLabelText('Replace link'));
  await confirm('Replace link?');
  await view.findByText('Unable to load sharing status. Please retry.');
  expect(view.getByLabelText('Share link')).toBeDisabled();
  expect(view.getByLabelText('Copy link')).toBeDisabled();
  fireEvent.press(view.getByLabelText('Retry sharing status'));
  await view.findByText(/server-replacement-token/);
  expect(view.getByLabelText('Copy link')).not.toBeDisabled();
  expect(invoiceService.createShareLink).toHaveBeenCalledTimes(1);
});

it('shows each active link with its created date and view count', async () => {
  jest.mocked(invoiceService.listShareLinks).mockResolvedValue([
    existing,
    { ...existing, shareToken: 'other-template-token', templateName: 'modern', accessCount: 1, createdAt: '2026-10-20T00:00:00.000Z' },
  ]);
  const view = setup();
  expect(await view.findByText('classic · Created 25 Oct 2026 · 2 views')).toBeVisible();
  expect(view.getByText('modern · Created 20 Oct 2026 · 1 view')).toBeVisible();
});

it('names revoke-all and does not call the server until the confirm dialog accepts', async () => {
  jest.mocked(invoiceService.revokeShareLinks).mockResolvedValue({ revoked: 1 });
  const view = setup();
  await view.findByText('Active · No expiry');
  fireEvent.press(view.getByLabelText('Revoke all links'));
  expect(invoiceService.revokeShareLinks).not.toHaveBeenCalled();
  expect(jest.mocked(Alert.alert).mock.calls.at(-1)?.[0]).toBe('Revoke all links?');
  await confirm('Revoke all links?');
  expect(invoiceService.revokeShareLinks).toHaveBeenCalledWith(mockInvoice.id);
});

it('lets a read-only member see links and reuse them without mutate actions', async () => {
  const view = setup({ canManageShares: false });
  expect(await view.findByText('classic · Created 25 Oct 2026 · 2 views')).toBeVisible();
  expect(view.queryByLabelText('Revoke all links')).toBeNull();
  expect(view.queryByLabelText('Replace link')).toBeNull();
  expect(view.queryByLabelText('Send invoice')).toBeNull();
  expect(view.queryByLabelText('Send reminder')).toBeNull();
  fireEvent.press(view.getByLabelText('Share link'));
  await waitFor(() => expect(Share.share).toHaveBeenCalled());
  expect(invoiceService.createShareLink).not.toHaveBeenCalled();
  expect(invoiceService.revokeShareLinks).not.toHaveBeenCalled();
});

it('hides link creation when a read-only member has no active link for this template', async () => {
  jest.mocked(invoiceService.listShareLinks).mockResolvedValue([]);
  const view = setup({ canManageShares: false });
  await view.findByText('No active link');
  expect(view.queryByLabelText('Share link')).toBeNull();
  expect(view.queryByLabelText('Replace link')).toBeNull();
  expect(view.queryByLabelText('Revoke all links')).toBeNull();
  expect(invoiceService.createShareLink).not.toHaveBeenCalled();
});

it('stays quiet when the native link share sheet throws a dismissal', async () => {
  jest.spyOn(Share, 'share').mockRejectedValueOnce(Object.assign(new Error('User did not share'), { code: 'ERR_CANCELED' }));
  const view = setup();
  await view.findByText('Active · No expiry');
  fireEvent.press(view.getByLabelText('Share link'));
  await waitFor(() => expect(Share.share).toHaveBeenCalled());
  expect(view.queryByText('Unable to complete action. Please try again.')).toBeNull();
  expect(Alert.alert).not.toHaveBeenCalled();
});
