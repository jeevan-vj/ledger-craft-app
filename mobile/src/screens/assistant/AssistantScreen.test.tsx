import React from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { AssistantProposal } from '@ledgercraft/contracts';
import { AuthApiError } from '@/features/auth/api/http';
import { askAssistant, previewAssistantProposal, saveAssistantDraft } from '@/features/assistant/api/assistantApi';
import { getServerCapabilities } from '@/services/capabilitiesService';
import { darkPalette } from '@/theme/tokens';
import AssistantScreen from './AssistantScreen';

jest.mock('@/features/assistant/api/assistantApi', () => ({
  askAssistant: jest.fn(),
  saveAssistantDraft: jest.fn(),
  previewAssistantProposal: jest.fn(),
}));

jest.mock('@/services/capabilitiesService', () => ({
  getServerCapabilities: jest.fn(),
}));

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return { ...actual, useNavigation: () => ({ navigate: mockNavigate }) };
});

const conversationId = '33333333-3333-4333-8333-333333333333';
const proposalId = '22222222-2222-4222-8222-222222222222';
const sarahChen = '11111111-1111-4111-8111-111111111111';
const sarahPatel = '55555555-5555-4555-8555-555555555555';
const invoiceId = '44444444-4444-4444-8444-444444444444';

const available = { email: 'unavailable' as const, ai: 'unavailable' as const, stripe: 'unavailable' as const, assistant: 'available' as const };

function proposal(overrides: Partial<AssistantProposal> = {}): AssistantProposal {
  return {
    id: proposalId,
    kind: 'invoice',
    status: 'ready',
    customerId: sarahChen,
    customerName: 'Sarah Chen',
    date: '2026-11-09',
    dueDate: '2026-11-13',
    taxInclusive: true,
    taxRate: '15',
    currency: 'NZD',
    notes: null,
    lines: [{ description: 'Plumbing', quantity: '3', rate: '120.00', unit: 'h', itemId: null, missing: [] }],
    missing: [],
    totals: { subtotal: '313.04', taxAmount: '46.96', total: '360.00' },
    ...overrides,
    actions: { saveDraft: true, send: false },
  };
}

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, right: 0, bottom: 34, left: 0 } }}>
      <QueryClientProvider client={client}>
        <AssistantScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

async function ask(message: string) {
  const screen = renderScreen();
  fireEvent.changeText(await screen.findByLabelText('Message'), message);
  fireEvent.press(screen.getByRole('button', { name: 'Ask' }));
  return screen;
}

describe('assistant chat', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    mockNavigate.mockClear();
    jest.mocked(getServerCapabilities).mockResolvedValue(available);
    jest.mocked(askAssistant).mockReset();
    jest.mocked(saveAssistantDraft).mockReset();
    jest.mocked(previewAssistantProposal).mockReset();
    jest.mocked(previewAssistantProposal).mockImplementation(() => new Promise(() => undefined));
  });

  it('shows an incomplete card when parts still have no price', async () => {
    jest.mocked(askAssistant).mockResolvedValue({
      conversationId,
      parts: [
        { type: 'text', text: 'Some invoice details are still missing.' },
        {
          type: 'proposal',
          proposal: proposal({
            status: 'needs_input',
            taxInclusive: null,
            totals: null,
            missing: ['taxInclusive', 'lines.1.rate'],
            lines: [
              { description: 'Plumbing', quantity: '3', rate: '120.00', unit: 'h', itemId: null, missing: [] },
              { description: 'Parts', quantity: '1', rate: null, unit: null, itemId: null, missing: ['rate'] },
            ],
          }),
        },
      ],
    });
    const screen = await ask('Invoice Sarah for 3h plumbing plus parts, due Friday');
    expect(await screen.findByText('Some invoice details are still missing.')).toBeTruthy();
    expect(screen.getByText('Incomplete')).toBeTruthy();
    expect(screen.getByLabelText('Rate for Parts').props.value).toBe('');
    expect(screen.queryByLabelText(/Total/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Save draft' }).props.accessibilityState.disabled).toBe(true);
  });

  it('shows customer picks for an ambiguous Sarah', async () => {
    jest.mocked(askAssistant).mockResolvedValue({
      conversationId,
      parts: [
        { type: 'quick_picks', field: 'customerId', prompt: 'Which customer?', options: [
          { id: sarahChen, label: 'Sarah Chen' },
          { id: sarahPatel, label: 'Sarah Patel' },
        ] },
      ],
    });
    const screen = await ask('Invoice Sarah for 1 hour of plumbing');
    expect(await screen.findByRole('button', { name: 'Sarah Chen' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sarah Patel' })).toBeTruthy();
  });

  it('shows a read-only outstanding summary', async () => {
    jest.mocked(askAssistant).mockResolvedValue({
      conversationId,
      parts: [
        { type: 'text', text: '2 outstanding invoices, 150.00 NZD.' },
        { type: 'link', href: `/invoices/${invoiceId}`, label: 'Invoice INV-1' },
      ],
    });
    const screen = await ask('Who owes me money?');
    expect(await screen.findByText('2 outstanding invoices, 150.00 NZD.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save draft' })).toBeNull();
    fireEvent.press(screen.getByRole('link', { name: 'Invoice INV-1' }));
    expect(mockNavigate).toHaveBeenCalledWith('Invoices', {
      state: {
        index: 1,
        routes: [{ name: 'InvoiceList' }, { name: 'InvoiceDetail', params: { invoiceId } }],
      },
    });
  });

  it('refuses a delete and links to invoices', async () => {
    jest.mocked(askAssistant).mockResolvedValue({
      conversationId,
      parts: [
        { type: 'text', text: 'That action is not available in the assistant. Use the Invoices screen.' },
        { type: 'link', href: '/invoices', label: 'Invoices' },
      ],
    });
    const screen = await ask('Delete all invoices');
    expect(await screen.findByText(/not available in the assistant/)).toBeTruthy();
    fireEvent.press(screen.getByRole('link', { name: 'Invoices' }));
    expect(mockNavigate).toHaveBeenCalledWith('Invoices', {
      state: { index: 0, routes: [{ name: 'InvoiceList' }] },
    });
  });

  it('keeps an edited rate and sends that rate on save', async () => {
    jest.mocked(askAssistant).mockResolvedValue({
      conversationId,
      parts: [
        { type: 'text', text: 'Review this invoice. Nothing is saved until you tap Save draft.' },
        { type: 'proposal', proposal: proposal() },
      ],
    });
    jest.mocked(saveAssistantDraft).mockResolvedValue({ id: invoiceId, status: 'draft' });
    const screen = await ask('Invoice Sarah for 3 hours of plumbing');
    const rate = await screen.findByLabelText('Rate for Plumbing');
    expect(rate.props.value).toBe('120.00');
    fireEvent.changeText(rate, '80.00');
    expect(screen.getByLabelText('Rate for Plumbing').props.value).toBe('80.00');
    expect(screen.getByText('Unconfirmed')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(saveAssistantDraft).toHaveBeenCalledWith({
      conversationId,
      proposalId,
      edits: { lines: [{ description: 'Plumbing', quantity: '3', rate: '80.00', unit: 'h', itemId: null }] },
    }, expect.any(String)));
    expect(mockNavigate).toHaveBeenCalledWith('Invoices', {
      state: {
        index: 1,
        routes: [{ name: 'InvoiceList' }, { name: 'InvoiceDetail', params: { invoiceId } }],
      },
    });
  });

  it('makes one save request when Save draft is tapped twice', async () => {
    jest.mocked(askAssistant).mockResolvedValue({
      conversationId,
      parts: [{ type: 'proposal', proposal: proposal() }],
    });
    let finish!: (value: { id: string; status: string }) => void;
    jest.mocked(saveAssistantDraft).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const screen = await ask('Invoice Sarah for plumbing');
    await screen.findByRole('button', { name: 'Save draft' });
    fireEvent.press(screen.getByRole('button', { name: 'Save draft' }));
    fireEvent.press(screen.getByRole('button', { name: 'Save draft' }));
    expect(saveAssistantDraft).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Save draft' }).props.accessibilityState.disabled).toBe(true);
    finish({ id: invoiceId, status: 'draft' });
    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
  });

  it.each([
    ['ASSISTANT_LIMIT', 429, 'Assistant limit reached for this business. Use Invoices to continue.'],
    ['ASSISTANT_TIMEOUT', 504, 'The assistant took too long. Nothing was saved. Use Invoices to continue.'],
    ['ASSISTANT_OUTPUT_INVALID', 502, 'The assistant returned an unusable response. Nothing was saved.'],
    ['ASSISTANT_DISABLED', 403, 'The assistant is turned off. Use Invoices to continue.'],
  ])('keeps the typed message after %s', async (code, status, message) => {
    jest.mocked(askAssistant).mockRejectedValue(new AuthApiError(message, status, code));
    const screen = await ask('Invoice Sarah for plumbing');
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.getByLabelText('Message').props.value).toBe('Invoice Sarah for plumbing');
    fireEvent.press(screen.getByRole('button', { name: 'Open the invoice form' }));
    expect(mockNavigate).toHaveBeenCalledWith('Invoices', {
      state: { index: 1, routes: [{ name: 'InvoiceList' }, { name: 'InvoiceCreate' }] },
    });
  });

  it('keeps the card when the proposal has expired', async () => {
    jest.mocked(askAssistant).mockResolvedValue({
      conversationId,
      parts: [{ type: 'proposal', proposal: proposal() }],
    });
    jest.mocked(saveAssistantDraft).mockRejectedValue(new AuthApiError('That proposal is not in this business.', 404, 'NOT_FOUND'));
    const screen = await ask('Invoice Sarah for plumbing');
    fireEvent.press(await screen.findByRole('button', { name: 'Save draft' }));
    expect(await screen.findByText('That proposal is not in this business.')).toBeTruthy();
    expect(screen.getByLabelText('Rate for Plumbing').props.value).toBe('120.00');
    expect(screen.getByRole('button', { name: 'Open the invoice form' })).toBeTruthy();
  });

  it('shows progress and cancel while a turn is running', async () => {
    let signal: AbortSignal | undefined;
    jest.mocked(askAssistant).mockImplementation((_body, next) => new Promise((_resolve, reject) => {
      signal = next;
      next?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }));
    const screen = await ask('Invoice Sarah for plumbing');
    expect(await screen.findByText('Working on that')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(signal?.aborted).toBe(true));
    expect(screen.queryByText('Working on that')).toBeNull();
    expect(screen.getByLabelText('Message').props.value).toBe('Invoice Sarah for plumbing');
  });

  it('hides the chat when the assistant capability is off', async () => {
    jest.mocked(getServerCapabilities).mockResolvedValue({ ...available, assistant: 'unavailable' });
    const screen = renderScreen();
    expect(await screen.findByText('The assistant is turned off.')).toBeTruthy();
    expect(screen.queryByLabelText('Message')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Open the invoice form' }));
    expect(mockNavigate).toHaveBeenCalledWith('Invoices', {
      state: { index: 1, routes: [{ name: 'InvoiceList' }, { name: 'InvoiceCreate' }] },
    });
  });

  it('keeps the composer above the keyboard and uses the dark canvas', async () => {
    const previous = Platform.OS;
    Platform.OS = 'android';
    try {
      const screen = renderScreen();
      await screen.findByLabelText('Message');
      const layout = screen.getByLabelText('Assistant conversation');
      expect(StyleSheet.flatten(layout.props.style).backgroundColor).toBe(darkPalette.background);
      expect(screen.UNSAFE_getByType(KeyboardAvoidingView).props.behavior).toBeUndefined();
    } finally {
      Platform.OS = previous;
    }
  });

  it('reprices an edit from the server after a short pause', async () => {
    jest.mocked(askAssistant).mockResolvedValue({
      conversationId,
      parts: [{ type: 'proposal', proposal: proposal() }],
    });
    jest.mocked(previewAssistantProposal).mockResolvedValue(pricedPreview());
    const screen = await ask('Invoice Sarah for plumbing');
    await screen.findByLabelText('Quantity for Plumbing');
    jest.useFakeTimers();
    try {
      fireEvent.changeText(screen.getByLabelText('Quantity for Plumbing'), '4');
      expect(previewAssistantProposal).not.toHaveBeenCalled();
      expect(screen.getByText('Unconfirmed')).toBeTruthy();
      await act(async () => { jest.advanceTimersByTime(399); });
      expect(previewAssistantProposal).not.toHaveBeenCalled();
      await act(async () => { jest.advanceTimersByTime(1); });
      expect(previewAssistantProposal).toHaveBeenCalledWith(proposalId, {
        conversationId,
        edits: { lines: [{ description: 'Plumbing', quantity: '4', rate: '120.00', unit: 'h', itemId: null }] },
      }, expect.any(AbortSignal));
      expect(screen.getByText('Subtotal 417.39 NZD')).toBeTruthy();
      expect(screen.getByText('GST 62.61 NZD')).toBeTruthy();
      expect(screen.getByText('480.00 NZD')).toBeTruthy();
      expect(screen.getByText('Line total 480.00 NZD')).toBeTruthy();
      expect(screen.queryByText('Incomplete')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('ignores a preview response that belongs to an older edit', async () => {
    jest.mocked(askAssistant).mockResolvedValue({
      conversationId,
      parts: [{ type: 'proposal', proposal: proposal() }],
    });
    const first = deferred<ReturnType<typeof pricedPreview>>();
    const second = deferred<ReturnType<typeof pricedPreview>>();
    jest.mocked(previewAssistantProposal)
      .mockImplementationOnce((_id, _body, signal) => {
        signal?.addEventListener('abort', () => undefined);
        return first.promise;
      })
      .mockImplementationOnce(() => second.promise);
    const screen = await ask('Invoice Sarah for plumbing');
    await screen.findByLabelText('Quantity for Plumbing');
    jest.useFakeTimers();
    try {
      fireEvent.changeText(screen.getByLabelText('Quantity for Plumbing'), '4');
      await act(async () => { jest.advanceTimersByTime(400); });
      fireEvent.changeText(screen.getByLabelText('Quantity for Plumbing'), '5');
      await act(async () => { jest.advanceTimersByTime(400); });
      expect(previewAssistantProposal).toHaveBeenCalledTimes(2);
      expect(jest.mocked(previewAssistantProposal).mock.calls[0]?.[1]).toEqual({
        conversationId,
        edits: { lines: [{ description: 'Plumbing', quantity: '4', rate: '120.00', unit: 'h', itemId: null }] },
      });
      expect(jest.mocked(previewAssistantProposal).mock.calls[1]?.[1]).toEqual({
        conversationId,
        edits: { lines: [{ description: 'Plumbing', quantity: '5', rate: '120.00', unit: 'h', itemId: null }] },
      });
      const firstSignal = jest.mocked(previewAssistantProposal).mock.calls[0]?.[2];
      expect(firstSignal?.aborted).toBe(true);
      await act(async () => {
        first.resolve(pricedPreview());
        await first.promise;
      });
      expect(screen.queryByText('480.00 NZD')).toBeNull();
      expect(screen.getByText('Unconfirmed')).toBeTruthy();
      await act(async () => {
        second.resolve(pricedPreview({
          lines: [{ description: 'Plumbing', quantity: '5', rate: '120.00', taxRate: '15', tax: '78.26', total: '600.00' }],
          subtotal: '521.74',
          taxAmount: '78.26',
          total: '600.00',
        }));
        await second.promise;
      });
      expect(screen.getByText('600.00 NZD')).toBeTruthy();
      expect(screen.getByText('Subtotal 521.74 NZD')).toBeTruthy();
      expect(screen.getByText('GST 78.26 NZD')).toBeTruthy();
      expect(screen.getByText('Line total 600.00 NZD')).toBeTruthy();
      expect(screen.queryByText('480.00 NZD')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('shows server field errors and keeps totals unconfirmed when preview is refused', async () => {
    jest.mocked(askAssistant).mockResolvedValue({
      conversationId,
      parts: [{ type: 'proposal', proposal: proposal() }],
    });
    jest.mocked(previewAssistantProposal).mockResolvedValue(pricedPreview({
      dueDate: '2026-11-01',
      errors: [{ field: 'dueDate', message: "Due date can't be before the invoice date" }],
    }));
    const screen = await ask('Invoice Sarah for plumbing');
    await screen.findByLabelText('Due date');
    jest.useFakeTimers();
    try {
      fireEvent.changeText(screen.getByLabelText('Due date'), '2026-11-01');
      await act(async () => { jest.advanceTimersByTime(400); });
      expect(screen.getByText("Due date can't be before the invoice date")).toBeTruthy();
      expect(screen.getByText('480.00 NZD')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }

    jest.mocked(previewAssistantProposal).mockRejectedValue(new AuthApiError(
      'Too many invoice previews. Wait a minute and try again.',
      429,
      'ASSISTANT_PREVIEW_LIMIT',
    ));
    const limited = await ask('Invoice Sarah again');
    await limited.findByLabelText('Quantity for Plumbing');
    jest.useFakeTimers();
    try {
      fireEvent.changeText(limited.getByLabelText('Quantity for Plumbing'), '4');
      await act(async () => { jest.advanceTimersByTime(400); });
      expect(limited.getByText('Too many invoice previews. Wait a minute and try again.')).toBeTruthy();
      expect(limited.getByText('Unconfirmed')).toBeTruthy();
      expect(limited.queryByText('360.00 NZD')).toBeNull();
      expect(limited.queryByText(/Last server total/)).toBeNull();
      expect(limited.getByLabelText('Quantity for Plumbing').props.value).toBe('4');
    } finally {
      jest.useRealTimers();
    }

    jest.mocked(previewAssistantProposal).mockRejectedValue(new AuthApiError(
      'That proposal is not in this business.',
      404,
      'NOT_FOUND',
    ));
    const missing = await ask('Invoice Sarah once more');
    await missing.findByLabelText('GST rate');
    jest.useFakeTimers();
    try {
      fireEvent.changeText(missing.getByLabelText('GST rate'), '10');
      await act(async () => { jest.advanceTimersByTime(400); });
      expect(missing.getByText('That proposal is not in this business.')).toBeTruthy();
      expect(missing.getByText('Unconfirmed')).toBeTruthy();
      expect(missing.queryByText(/Last server total/)).toBeNull();
      expect(missing.getByLabelText('GST rate').props.value).toBe('10');
      expect(missing.getByRole('button', { name: 'Save draft' })).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('sends the edited issue date and GST rate when the draft is saved', async () => {
    jest.mocked(askAssistant).mockResolvedValue({
      conversationId,
      parts: [{ type: 'proposal', proposal: proposal() }],
    });
    jest.mocked(saveAssistantDraft).mockResolvedValue({ id: invoiceId, status: 'draft' });
    const screen = await ask('Invoice Sarah for plumbing');
    fireEvent.changeText(await screen.findByLabelText('Issue date'), '2026-11-10');
    fireEvent.changeText(screen.getByLabelText('GST rate'), '10');
    fireEvent.press(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(saveAssistantDraft).toHaveBeenCalledWith({
      conversationId,
      proposalId,
      edits: { issueDate: '2026-11-10', taxRate: '10' },
    }, expect.any(String)));
  });

  it('does not show the previous total when the GST rate is not a rate', async () => {
    jest.mocked(askAssistant).mockResolvedValue({
      conversationId,
      parts: [{ type: 'proposal', proposal: proposal() }],
    });
    const screen = await ask('Invoice Sarah for plumbing');
    expect(await screen.findByText('360.00 NZD')).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('GST rate'), '150');
    expect(screen.getByText('Enter a GST rate from 0 to 100')).toBeTruthy();
    expect(screen.getByLabelText('GST rate').props.accessibilityHint).toBe('Enter a GST rate from 0 to 100');
    expect(screen.queryByText('360.00 NZD')).toBeNull();
    expect(screen.getByText('Unconfirmed')).toBeTruthy();
    expect(previewAssistantProposal).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByLabelText('GST rate'), 'abc');
    expect(screen.getByText('Enter a GST rate from 0 to 100')).toBeTruthy();
    expect(screen.queryByText('360.00 NZD')).toBeNull();
  });

  it('does not show the previous total when the issue date is not a real day', async () => {
    jest.mocked(askAssistant).mockResolvedValue({
      conversationId,
      parts: [{ type: 'proposal', proposal: proposal() }],
    });
    const screen = await ask('Invoice Sarah for plumbing');
    await screen.findByText('360.00 NZD');
    fireEvent.changeText(screen.getByLabelText('Issue date'), '2026-02-31');
    expect(screen.getByText('Enter a real date')).toBeTruthy();
    expect(screen.queryByText('360.00 NZD')).toBeNull();
    expect(screen.getByText('Unconfirmed')).toBeTruthy();
    expect(previewAssistantProposal).not.toHaveBeenCalled();
  });

  it('drops a confirmed total when the GST rate on screen is no longer the priced rate', async () => {
    jest.mocked(askAssistant).mockResolvedValue({
      conversationId,
      parts: [{ type: 'proposal', proposal: proposal() }],
    });
    jest.mocked(previewAssistantProposal).mockResolvedValue(pricedPreview());
    const screen = await ask('Invoice Sarah for plumbing');
    await screen.findByLabelText('Quantity for Plumbing');
    jest.useFakeTimers();
    try {
      fireEvent.changeText(screen.getByLabelText('Quantity for Plumbing'), '4');
      await act(async () => { jest.advanceTimersByTime(400); });
      expect(screen.getByText('480.00 NZD')).toBeTruthy();
      fireEvent.changeText(screen.getByLabelText('GST rate'), '150');
      expect(screen.getByText('Enter a GST rate from 0 to 100')).toBeTruthy();
      expect(screen.queryByText('480.00 NZD')).toBeNull();
      expect(screen.getByText('Unconfirmed')).toBeTruthy();
      expect(previewAssistantProposal).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});

function pricedPreview(overrides: Record<string, unknown> = {}) {
  return {
    proposalId,
    date: '2026-11-09',
    dueDate: '2026-11-13',
    taxInclusive: true,
    taxRate: '15',
    lines: [{ description: 'Plumbing', quantity: '4', rate: '120.00', taxRate: '15', tax: '62.61', total: '480.00' }],
    subtotal: '417.39',
    taxAmount: '62.61',
    total: '480.00',
    errors: [] as { field: string; message: string }[],
    ...overrides,
  };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}
