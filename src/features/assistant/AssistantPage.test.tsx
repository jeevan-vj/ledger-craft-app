import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Sidebar } from '@/components/layout/Sidebar';
import { resetServerCapabilitiesForTests } from '@/services/capabilitiesService';
import { AssistantPage } from './AssistantPage';

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => true }),
}));

const SARAH = '22222222-2222-4222-8222-222222222222';
const SARAH_JONES = '33333333-3333-4333-8333-333333333333';
const PROPOSAL = '11111111-1111-4111-8111-111111111111';
const CONVO = '44444444-4444-4444-8444-444444444444';
const INVOICE = '55555555-5555-4555-8555-555555555555';

const fetchMock = vi.fn();

function health(assistant: 'available' | 'unavailable') {
  return {
    status: 'ok',
    capabilities: { email: 'unavailable', ai: 'unavailable', stripe: 'unavailable', assistant },
  };
}

function proposal(overrides: Record<string, unknown> = {}) {
  return {
    id: PROPOSAL,
    kind: 'invoice',
    status: 'ready',
    customerId: SARAH,
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
    actions: { saveDraft: true, send: false },
    ...overrides,
  };
}

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
}

function errorBody(code: string, message: string, status: number) {
  return json({ error: { code, message, requestId: 'req-assistant-1' } }, status);
}

function SavedDraft() {
  const { id } = useParams();
  return <h1>Saved draft {id}</h1>;
}

function mount(path = '/assistant') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/assistant" element={<AssistantPage />} />
          <Route path="/invoices/:id" element={<SavedDraft />} />
          <Route path="/" element={<Sidebar collapsed={false} isMobile={false} />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function ask(text: string) {
  const user = userEvent.setup();
  await user.type(await screen.findByRole('textbox', { name: 'Message' }), text);
  await user.click(screen.getByRole('button', { name: 'Ask' }));
  return user;
}

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  resetServerCapabilitiesForTests();
  fetchMock.mockReset();
  fetchMock.mockImplementation((input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/api/healthz')) return json(health('available'));
    if (init?.signal?.aborted) return Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    return json({ conversationId: CONVO, parts: [{ type: 'text', text: 'Tell me what you want to do, or use the Invoices screen.' }] });
  });
  vi.stubGlobal('fetch', fetchMock);
});

describe('Assistant page', () => {
  it('shows an incomplete invoice card when the parts price is missing', async () => {
    fetchMock.mockImplementation((input: RequestInfo) => {
      const url = String(input);
      if (url.includes('/api/healthz')) return json(health('available'));
      return json({
        conversationId: CONVO,
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
    });
    mount();
    await ask('Invoice Sarah for 3h plumbing plus parts, due Friday');
    expect(await screen.findByText('Some invoice details are still missing.')).toBeInTheDocument();
    expect(screen.getByText('Incomplete')).toBeInTheDocument();
    expect(screen.getByLabelText('Rate for Parts')).toHaveValue('');
    expect(screen.getByLabelText('Rate for Plumbing')).toHaveValue('120.00');
    expect(screen.queryByText('360.00')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
  });

  it('shows keyboard-accessible customer picks for an ambiguous Sarah', async () => {
    fetchMock.mockImplementation((input: RequestInfo) => {
      const url = String(input);
      if (url.includes('/api/healthz')) return json(health('available'));
      return json({
        conversationId: CONVO,
        parts: [{
          type: 'quick_picks',
          field: 'customerId',
          prompt: 'Which customer?',
          options: [
            { id: SARAH, label: 'Sarah Chen' },
            { id: SARAH_JONES, label: 'Sarah Jones' },
          ],
        }],
      });
    });
    mount();
    await ask('Invoice Sarah for 1 hour of plumbing');
    const chen = await screen.findByRole('button', { name: 'Sarah Chen' });
    const jones = screen.getByRole('button', { name: 'Sarah Jones' });
    expect(chen).toBeEnabled();
    expect(jones).toBeEnabled();
    chen.focus();
    expect(chen).toHaveFocus();
  });

  it('renders a read-only outstanding summary with a source link', async () => {
    fetchMock.mockImplementation((input: RequestInfo) => {
      const url = String(input);
      if (url.includes('/api/healthz')) return json(health('available'));
      return json({
        conversationId: CONVO,
        parts: [
          { type: 'text', text: '1 outstanding invoice, 100.00 NZD.' },
          { type: 'link', href: `/invoices/${INVOICE}`, label: 'Invoice INV-1001' },
        ],
      });
    });
    mount();
    await ask('Who owes me money?');
    expect(await screen.findByText('1 outstanding invoice, 100.00 NZD.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Invoice INV-1001' })).toHaveAttribute('href', `/invoices/${INVOICE}`);
    expect(screen.queryByRole('button', { name: 'Save draft' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument();
  });

  it('shows a refusal and a link to the normal invoices screen', async () => {
    fetchMock.mockImplementation((input: RequestInfo) => {
      const url = String(input);
      if (url.includes('/api/healthz')) return json(health('available'));
      return json({
        conversationId: CONVO,
        parts: [
          { type: 'text', text: 'That action is not available in the assistant. Use the Invoices screen.' },
          { type: 'link', href: '/invoices', label: 'Invoices' },
        ],
      });
    });
    mount();
    await ask('Delete all invoices');
    expect(await screen.findByText(/not available in the assistant/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Invoices' })).toHaveAttribute('href', '/invoices');
  });

  it('keeps a rate the user edited and sends that rate on save', async () => {
    fetchMock.mockImplementation((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/healthz')) return json(health('available'));
      if (url.includes('/api/ai/assistant/drafts')) {
        return json({ id: INVOICE });
      }
      return json({
        conversationId: CONVO,
        parts: [
          { type: 'text', text: 'Review this invoice. Nothing is saved until you tap Save draft.' },
          { type: 'proposal', proposal: proposal() },
        ],
      });
    });
    mount();
    const user = await ask('Invoice Sarah for 3 hours of plumbing');
    const rate = await screen.findByLabelText('Rate for Plumbing');
    expect(rate).toHaveValue('120.00');
    await user.clear(rate);
    await user.type(rate, '80.00');
    expect(rate).toHaveValue('80.00');
    expect(screen.queryByText('360.00')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByRole('heading', { name: `Saved draft ${INVOICE}` });
    const saveCall = fetchMock.mock.calls.find((call) => String(call[0]).includes('/api/ai/assistant/drafts'));
    expect(saveCall).toBeTruthy();
    const body = JSON.parse(String((saveCall?.[1] as RequestInit).body));
    expect(body).toMatchObject({
      conversationId: CONVO,
      proposalId: PROPOSAL,
      edits: { lines: [{ description: 'Plumbing', quantity: '3', rate: '80.00', unit: 'h', itemId: null }] },
    });
    expect(body.total).toBeUndefined();
  });

  it('sends one save request when Save draft is clicked twice', async () => {
    let release: (value: Response) => void = () => {};
    fetchMock.mockImplementation((input: RequestInfo) => {
      const url = String(input);
      if (url.includes('/api/healthz')) return json(health('available'));
      if (url.includes('/api/ai/assistant/drafts')) {
        return new Promise<Response>((resolve) => {
          release = resolve;
        });
      }
      return json({
        conversationId: CONVO,
        parts: [{ type: 'proposal', proposal: proposal() }],
      });
    });
    mount();
    await ask('Invoice Sarah for plumbing');
    const save = await screen.findByRole('button', { name: 'Save draft' });
    fireEvent.click(save);
    fireEvent.click(save);
    const saves = () => fetchMock.mock.calls.filter((call) => String(call[0]).includes('/api/ai/assistant/drafts'));
    expect(saves()).toHaveLength(1);
    await waitFor(() => expect(save).toBeDisabled());
    release(new Response(JSON.stringify({ id: INVOICE }), { status: 201, headers: { 'Content-Type': 'application/json' } }));
    await screen.findByRole('heading', { name: `Saved draft ${INVOICE}` });
    expect(saves()).toHaveLength(1);
    expect((saves()[0][1] as RequestInit).headers).toEqual(expect.objectContaining({ 'Idempotency-Key': expect.any(String) }));
  });

  it('reuses the idempotency key when the same failed save is tapped again', async () => {
    fetchMock.mockImplementation((input: RequestInfo) => {
      const url = String(input);
      if (url.includes('/api/healthz')) return json(health('available'));
      if (url.includes('/api/ai/assistant/drafts')) {
        return errorBody('NOT_FOUND', 'That proposal is not in this business.', 404);
      }
      return json({
        conversationId: CONVO,
        parts: [{ type: 'proposal', proposal: proposal() }],
      });
    });
    mount();
    const user = await ask('Invoice Sarah for plumbing');
    const save = await screen.findByRole('button', { name: 'Save draft' });
    const saves = () => fetchMock.mock.calls.filter((call) => String(call[0]).includes('/api/ai/assistant/drafts'));
    const keyOf = (call: unknown[]) => (call[1] as RequestInit).headers as Record<string, string>;
    await user.click(save);
    await screen.findByRole('alert');
    await waitFor(() => expect(saves()).toHaveLength(1));
    await user.click(save);
    await waitFor(() => expect(saves()).toHaveLength(2));
    expect(keyOf(saves()[1])['Idempotency-Key']).toBe(keyOf(saves()[0])['Idempotency-Key']);
    expect(JSON.parse(String((saves()[1][1] as RequestInit).body))).toEqual(JSON.parse(String((saves()[0][1] as RequestInit).body)));
    const rate = screen.getByLabelText('Rate for Plumbing');
    await user.clear(rate);
    await user.type(rate, '80.00');
    await user.click(save);
    await waitFor(() => expect(saves()).toHaveLength(3));
    expect(keyOf(saves()[2])['Idempotency-Key']).not.toBe(keyOf(saves()[0])['Idempotency-Key']);
  });

  it('keeps the typed message when the assistant limit or capability stops the turn', async () => {
    const cases = [
      { code: 'ASSISTANT_LIMIT', status: 429, message: 'Assistant limit reached for this business. Use Invoices to continue.' },
      { code: 'ASSISTANT_TIMEOUT', status: 504, message: 'The assistant took too long. Nothing was saved. Use Invoices to continue.' },
      { code: 'ASSISTANT_OUTPUT_INVALID', status: 502, message: 'The assistant returned an unusable response. Nothing was saved.' },
      { code: 'ASSISTANT_DISABLED', status: 403, message: 'The assistant is turned off. Use Invoices to continue.' },
    ];
    for (const item of cases) {
      resetServerCapabilitiesForTests();
      fetchMock.mockImplementation((input: RequestInfo) => {
        const url = String(input);
        if (url.includes('/api/healthz')) return json(health('available'));
        return errorBody(item.code, item.message, item.status);
      });
      const view = mount();
      const typed = `Please invoice Sarah (${item.code})`;
      await ask(typed);
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(item.message);
      expect(alert).toHaveFocus();
      expect(within(alert).getByRole('link', { name: 'Open the invoice form' })).toHaveAttribute('href', '/invoices/new');
      expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue(typed);
      view.unmount();
    }
  });

  it('keeps the edited card when the proposal has expired', async () => {
    fetchMock.mockImplementation((input: RequestInfo) => {
      const url = String(input);
      if (url.includes('/api/healthz')) return json(health('available'));
      if (url.includes('/api/ai/assistant/drafts')) {
        return errorBody('NOT_FOUND', 'That proposal is not in this business.', 404);
      }
      return json({
        conversationId: CONVO,
        parts: [{ type: 'proposal', proposal: proposal() }],
      });
    });
    mount();
    const user = await ask('Invoice Sarah for plumbing');
    const rate = await screen.findByLabelText('Rate for Plumbing');
    await user.clear(rate);
    await user.type(rate, '80.00');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('That proposal is not in this business.');
    expect(within(alert).getByRole('link', { name: 'Open the invoice form' })).toBeInTheDocument();
    expect(rate).toHaveValue('80.00');
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('');
  });

  it('shows progress and cancel without dropping the typed message', async () => {
    let rejectTurn: (error: Error) => void = () => {};
    fetchMock.mockImplementation((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/healthz')) return json(health('available'));
      return new Promise((_resolve, reject) => {
        rejectTurn = reject;
        init?.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        });
      });
    });
    mount();
    const user = userEvent.setup();
    const message = await screen.findByRole('textbox', { name: 'Message' });
    await user.type(message, 'Who owes me money?');
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/working/i);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(message).toHaveValue('Who owes me money?');
    expect(rejectTurn).toBeTypeOf('function');
  });

  it('hides the shell entry and offers the invoice form when the assistant is off', async () => {
    fetchMock.mockImplementation(() => json(health('unavailable')));
    mount('/');
    await waitFor(() => expect(screen.getByRole('navigation')).toHaveAttribute('data-assistant', 'unavailable'));
    expect(screen.queryByRole('link', { name: 'Assistant' })).not.toBeInTheDocument();

    resetServerCapabilitiesForTests();
    mount('/assistant');
    expect(await screen.findByRole('heading', { name: 'Assistant is off' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the invoice form' })).toHaveAttribute('href', '/invoices/new');
    expect(screen.queryByRole('textbox', { name: 'Message' })).not.toBeInTheDocument();
  });

  it('links to the assistant from the shell when the capability is available', async () => {
    mount('/');
    expect(await screen.findByRole('link', { name: 'Assistant' })).toHaveAttribute('href', '/assistant');
  });

  it('reprices an edit from the server after a short pause', async () => {
    fetchMock.mockImplementation((input: RequestInfo) => {
      const url = String(input);
      if (url.includes('/api/healthz')) return json(health('available'));
      if (url.includes('/preview')) return json(pricedPreview());
      return json({
        conversationId: CONVO,
        parts: [{ type: 'proposal', proposal: proposal() }],
      });
    });
    mount();
    await ask('Invoice Sarah for plumbing');
    const quantity = await screen.findByLabelText('Quantity for Plumbing');
    vi.useFakeTimers();
    try {
      fireEvent.change(quantity, { target: { value: '4' } });
      expect(previewCalls()).toHaveLength(0);
      expect(screen.getByText('Unconfirmed')).toBeInTheDocument();
      expect(screen.queryByText('360.00 NZD')).not.toBeInTheDocument();
      await act(async () => { await vi.advanceTimersByTimeAsync(399); });
      expect(previewCalls()).toHaveLength(0);
      await act(async () => { await vi.advanceTimersByTimeAsync(1); });
      expect(previewCalls()).toHaveLength(1);
      const body = JSON.parse(String((previewCalls()[0]?.[1] as RequestInit).body));
      expect(body).toEqual({
        conversationId: CONVO,
        edits: { lines: [{ description: 'Plumbing', quantity: '4', rate: '120.00', unit: 'h', itemId: null }] },
      });
      expect(screen.getByText('Priced by the server')).toBeInTheDocument();
      expect(screen.getByText('417.39 NZD')).toBeInTheDocument();
      expect(screen.getByText('62.61 NZD')).toBeInTheDocument();
      expect(screen.getByText('480.00 NZD')).toBeInTheDocument();
      expect(screen.getByText('Line total 480.00 NZD')).toBeInTheDocument();
      expect(screen.queryByText('360.00')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores a preview response that belongs to an older edit', async () => {
    const pending: Array<{ resolve: (response: Response) => void; signal: AbortSignal | undefined }> = [];
    fetchMock.mockImplementation((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/healthz')) return json(health('available'));
      if (url.includes('/preview')) {
        return new Promise<Response>((resolve) => {
          pending.push({ resolve, signal: init?.signal ?? undefined });
        });
      }
      return json({
        conversationId: CONVO,
        parts: [{ type: 'proposal', proposal: proposal() }],
      });
    });
    mount();
    await ask('Invoice Sarah for plumbing');
    const quantity = await screen.findByLabelText('Quantity for Plumbing');
    vi.useFakeTimers();
    try {
      fireEvent.change(quantity, { target: { value: '4' } });
      await act(async () => { await vi.advanceTimersByTimeAsync(400); });
      fireEvent.change(quantity, { target: { value: '5' } });
      await act(async () => { await vi.advanceTimersByTimeAsync(400); });
      expect(pending).toHaveLength(2);
      expect(pending[0]?.signal?.aborted).toBe(true);
      const firstQuantity = JSON.parse(String((previewCalls()[0]?.[1] as RequestInit).body)).edits.lines[0].quantity;
      const secondQuantity = JSON.parse(String((previewCalls()[1]?.[1] as RequestInit).body)).edits.lines[0].quantity;
      expect(firstQuantity).toBe('4');
      expect(secondQuantity).toBe('5');
      await act(async () => {
        pending[0]?.resolve(new Response(JSON.stringify(pricedPreview({
          lines: [{ description: 'Plumbing', quantity: '4', rate: '120.00', taxRate: '15', tax: '62.61', total: '480.00' }],
          subtotal: '417.39',
          taxAmount: '62.61',
          total: '480.00',
        })), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      });
      expect(screen.queryByText('480.00 NZD')).not.toBeInTheDocument();
      expect(screen.getByText('Unconfirmed')).toBeInTheDocument();
      await act(async () => {
        pending[1]?.resolve(new Response(JSON.stringify(pricedPreview({
          lines: [{ description: 'Plumbing', quantity: '5', rate: '120.00', taxRate: '15', tax: '78.26', total: '600.00' }],
          subtotal: '521.74',
          taxAmount: '78.26',
          total: '600.00',
        })), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      });
      expect(screen.getByText('600.00 NZD')).toBeInTheDocument();
      expect(screen.getByText('521.74 NZD')).toBeInTheDocument();
      expect(screen.getByText('78.26 NZD')).toBeInTheDocument();
      expect(screen.getByText('Line total 600.00 NZD')).toBeInTheDocument();
      expect(screen.queryByText('480.00 NZD')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows server field errors and keeps totals unconfirmed when preview is refused', async () => {
    fetchMock.mockImplementation((input: RequestInfo) => {
      const url = String(input);
      if (url.includes('/api/healthz')) return json(health('available'));
      if (url.includes('/preview')) {
        return json(pricedPreview({
          dueDate: '2026-11-01',
          errors: [{ field: 'dueDate', message: "Due date can't be before the invoice date" }],
        }));
      }
      return json({
        conversationId: CONVO,
        parts: [{ type: 'proposal', proposal: proposal() }],
      });
    });
    const view = mount();
    await ask('Invoice Sarah for plumbing');
    const due = await screen.findByLabelText('Due date');
    vi.useFakeTimers();
    try {
      fireEvent.change(due, { target: { value: '2026-11-01' } });
      await act(async () => { await vi.advanceTimersByTimeAsync(400); });
      expect(screen.getByText("Due date can't be before the invoice date")).toBeInTheDocument();
      expect(due).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByText('480.00 NZD')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
      view.unmount();
    }

    const refused = [
      { code: 'ASSISTANT_PREVIEW_LIMIT', status: 429, message: 'Too many invoice previews. Wait a minute and try again.' },
      { code: 'NOT_FOUND', status: 404, message: 'That proposal is not in this business.' },
    ];
    for (const item of refused) {
      fetchMock.mockImplementation((input: RequestInfo) => {
        const url = String(input);
        if (url.includes('/api/healthz')) return json(health('available'));
        if (url.includes('/preview')) return errorBody(item.code, item.message, item.status);
        return json({
          conversationId: CONVO,
          parts: [{ type: 'proposal', proposal: proposal() }],
        });
      });
      const view = mount();
      await ask(`Invoice Sarah (${item.code})`);
      const quantity = await screen.findByLabelText('Quantity for Plumbing');
      vi.useFakeTimers();
      try {
        fireEvent.change(quantity, { target: { value: '4' } });
        await act(async () => { await vi.advanceTimersByTimeAsync(400); });
        const alert = screen.getByRole('alert');
        expect(alert).toHaveTextContent(item.message);
        expect(screen.getByText('Unconfirmed')).toBeInTheDocument();
        expect(screen.queryByText('360.00 NZD')).not.toBeInTheDocument();
        expect(quantity).toHaveValue('4');
        expect(screen.getByRole('button', { name: 'Save draft' })).toBeEnabled();
      } finally {
        vi.useRealTimers();
      }
      view.unmount();
    }
  });

  it('sends the edited issue date and GST rate when the draft is saved', async () => {
    fetchMock.mockImplementation((input: RequestInfo) => {
      const url = String(input);
      if (url.includes('/api/healthz')) return json(health('available'));
      if (url.includes('/api/ai/assistant/drafts')) return json({ id: INVOICE });
      if (url.includes('/preview')) return json(pricedPreview({ date: '2026-11-10', taxRate: '10' }));
      return json({
        conversationId: CONVO,
        parts: [{ type: 'proposal', proposal: proposal() }],
      });
    });
    mount();
    await ask('Invoice Sarah for plumbing');
    fireEvent.change(await screen.findByLabelText('Issue date'), { target: { value: '2026-11-10' } });
    fireEvent.change(screen.getByLabelText('GST rate'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByRole('heading', { name: `Saved draft ${INVOICE}` });
    const saveCall = fetchMock.mock.calls.find((call) => String(call[0]).includes('/api/ai/assistant/drafts'));
    const body = JSON.parse(String((saveCall?.[1] as RequestInit).body));
    expect(body).toEqual({
      conversationId: CONVO,
      proposalId: PROPOSAL,
      edits: { issueDate: '2026-11-10', taxRate: '10' },
    });
    const keys = fetchMock.mock.calls
      .filter((call) => String(call[0]).includes('/api/ai/assistant/drafts'))
      .map((call) => (call[1] as RequestInit).headers);
    expect(keys).toHaveLength(1);
  });

  it('keeps totals unconfirmed when the GST rate on screen was not priced', async () => {
    fetchMock.mockImplementation((input: RequestInfo) => {
      const url = String(input);
      if (url.includes('/api/healthz')) return json(health('available'));
      if (url.includes('/preview')) return json(pricedPreview());
      return json({
        conversationId: CONVO,
        parts: [{ type: 'proposal', proposal: proposal() }],
      });
    });
    mount();
    await ask('Invoice Sarah for plumbing');
    const quantity = await screen.findByLabelText('Quantity for Plumbing');
    vi.useFakeTimers();
    try {
      fireEvent.change(quantity, { target: { value: '4' } });
      await act(async () => { await vi.advanceTimersByTimeAsync(400); });
      expect(screen.getByText('480.00 NZD')).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('GST rate'), { target: { value: '150' } });
      const rate = screen.getByLabelText('GST rate');
      expect(rate).toHaveAttribute('aria-invalid', 'true');
      expect(rate).toHaveAttribute('aria-describedby', `gst-rate-error-${PROPOSAL}`);
      expect(screen.getByText('Enter a GST rate from 0 to 100')).toBeInTheDocument();
      expect(screen.getByText('Unconfirmed')).toBeInTheDocument();
      expect(screen.queryByText('480.00 NZD')).not.toBeInTheDocument();
      expect(screen.queryByText('360.00 NZD')).not.toBeInTheDocument();
      fireEvent.change(rate, { target: { value: 'abc' } });
      expect(screen.getByText('Enter a GST rate from 0 to 100')).toBeInTheDocument();
      expect(previewCalls()).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps totals unconfirmed when the issue date on screen is not a real day', async () => {
    fetchMock.mockImplementation((input: RequestInfo) => {
      const url = String(input);
      if (url.includes('/api/healthz')) return json(health('available'));
      if (url.includes('/preview')) return json(pricedPreview());
      return json({
        conversationId: CONVO,
        parts: [{ type: 'proposal', proposal: proposal() }],
      });
    });
    mount();
    await ask('Invoice Sarah for plumbing');
    await screen.findByText('360.00 NZD');
    vi.useFakeTimers();
    try {
      fireEvent.change(screen.getByLabelText('Issue date'), { target: { value: '2026-02-31' } });
      const issue = screen.getByLabelText('Issue date');
      expect(issue).toHaveAttribute('aria-invalid', 'true');
      expect(issue).toHaveAttribute('aria-describedby', `issue-error-${PROPOSAL}`);
      expect(screen.getByText('Enter a real date')).toBeInTheDocument();
      expect(screen.getByText('Unconfirmed')).toBeInTheDocument();
      expect(screen.queryByText('360.00 NZD')).not.toBeInTheDocument();
      await act(async () => { await vi.advanceTimersByTimeAsync(400); });
      expect(previewCalls()).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

function pricedPreview(overrides: Record<string, unknown> = {}) {
  return {
    proposalId: PROPOSAL,
    date: '2026-11-09',
    dueDate: '2026-11-13',
    taxInclusive: true,
    taxRate: '15',
    lines: [{ description: 'Plumbing', quantity: '4', rate: '120.00', taxRate: '15', tax: '62.61', total: '480.00' }],
    subtotal: '417.39',
    taxAmount: '62.61',
    total: '480.00',
    errors: [],
    ...overrides,
  };
}

function previewCalls() {
  return fetchMock.mock.calls.filter((call) => String(call[0]).includes('/preview'));
}
