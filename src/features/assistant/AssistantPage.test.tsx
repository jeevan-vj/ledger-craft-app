import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
});
