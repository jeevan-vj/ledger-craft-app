import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { InvoiceCreditNotesPanel } from './InvoiceCreditNotesPanel';
vi.mock('@/context/StableAuthContext', () => ({ useAuth: () => ({ user: { id: 'credit-owner' } }) }));
const id = (digit: string) => `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`;
const invoiceId = id('1');
const note = { id: id('2'), creditNoteNumber: 'CN-001', invoiceId, customerId: id('3'), issueDate: '2026-04-15', reason: 'Returned consulting service', status: 'issued', reversalDate: null, reversalReason: null, currency: 'NZD', exchangeRate: '1', exchangeRateId: null, baseCurrency: 'NZD', subtotal: '200.00', taxAmount: '30.00', total: '230.00', baseTotal: '230.00', baseTaxAmount: '30.00', receivableAmount: '230.00', baseReceivableAmount: '230.00', customerCreditAmount: '0.00', baseCustomerCreditAmount: '0.00', baseCustomerCreditTaxAmount: '0.00', refundedAmount: '0.00', baseRefundedAmount: '0.00', refundAvailable: '0.00', items: [], refunds: [], createdAt: '2026-04-15T00:00:00.000Z', createdBy: 'owner' };
let notes: Array<typeof note> = [];
let failIssueOnce = false;
let failRefundOnce = false;
const calls: Array<{ path: string; body?: Record<string, unknown>; key?: string }> = [];
beforeEach(() => { notes = []; calls.length = 0; failIssueOnce = false; failRefundOnce = false; localStorage.clear(); vi.stubGlobal('fetch', vi.fn(async (path: string, init?: RequestInit) => {
  const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
  calls.push({ path, body, key: new Headers(init?.headers).get('Idempotency-Key') ?? undefined });
  let value: unknown = { creditNotes: notes };
  if (path === '/api/organisations') value = { organisations: [{ id: id('5'), name: 'Credit company', role: 'owner', isActive: true, archivedAt: null }] };
  else if (path === '/api/bank-accounts') value = { bankAccounts: [{ id: id('4'), accountName: 'Operating NZD', currency: 'NZD', isActive: true }] };
  else if (path === '/api/credit-notes' && body) { notes = [note]; value = note; if (failIssueOnce) { failIssueOnce = false; throw new Error('Connection lost'); } }
  else if (path.endsWith('/reverse') && body) { notes = [{ ...note, status: 'reversed' }]; value = notes[0]; }
  else if (path.endsWith('/refunds') && body) { value = { ...notes[0], refundedAmount: '230.00', refundAvailable: '0.00' }; notes = [value as typeof note]; if (failRefundOnce) { failRefundOnce = false; throw new Error('Connection lost'); } }
  return new Response(JSON.stringify(value), { status: body && path === '/api/credit-notes' ? 201 : 200 });
})); });
it('issues an exact one-line credit note only after source treatment confirmation', async () => {
  render(<InvoiceCreditNotesPanel invoiceId={invoiceId} currency="NZD" />);
  await screen.findByText('No credit notes recorded for this invoice');
  fireEvent.change(screen.getByLabelText('Credit note reason'), { target: { value: 'Returned consulting service' } });
  fireEvent.change(screen.getByLabelText('Credit line amount'), { target: { value: '200.00' } });
  expect(screen.getByRole('button', { name: 'Issue credit note' })).toBeDisabled();
  fireEvent.click(screen.getByLabelText('I have checked this credit against the original invoice and its GST treatment'));
  fireEvent.click(screen.getByRole('button', { name: 'Issue credit note' }));
  expect(await screen.findByText('CN-001')).toBeInTheDocument();
  expect(screen.getByText('Invoice receivable reduced: NZD 230.00')).toBeInTheDocument();
  expect(calls.find((call) => call.path === '/api/credit-notes' && call.body)).toMatchObject({ body: { invoiceId, reason: 'Returned consulting service', taxInclusive: false, taxRate: '15', items: [{ description: 'Returned consulting service', quantity: '1', rate: '200.00' }] }, key: expect.any(String) });
});
it('refunds a paid-invoice credit through an explicit bank without creating a second receipt', async () => {
  notes = [{ ...note, receivableAmount: '0.00', baseReceivableAmount: '0.00', customerCreditAmount: '230.00', baseCustomerCreditAmount: '230.00', baseCustomerCreditTaxAmount: '30.00', refundAvailable: '230.00' }];
  render(<InvoiceCreditNotesPanel invoiceId={invoiceId} currency="NZD" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Refund CN-001' }));
  await screen.findByRole('option', { name: 'Operating NZD' });
  fireEvent.change(screen.getByLabelText('Refund paid from account'), { target: { value: id('4') } });
  fireEvent.click(screen.getByLabelText('I have reviewed this credit note action and supporting records'));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm customer refund' }));
  expect(await screen.findByText('Customer refund recorded')).toBeInTheDocument();
  expect(calls.find((call) => call.path.endsWith('/refunds'))).toMatchObject({ body: { amount: '230.00', bankAccountId: id('4') }, key: expect.any(String) });
  expect(calls.some((call) => call.path === '/api/payments')).toBe(false);
});
it('reverses an issued credit through a dated reason and retains the original document', async () => {
  notes = [note]; render(<InvoiceCreditNotesPanel invoiceId={invoiceId} currency="NZD" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Reverse CN-001' }));
  fireEvent.change(screen.getByLabelText('Credit action reason'), { target: { value: 'Credit issued against wrong service' } });
  fireEvent.click(screen.getByLabelText('I have reviewed this credit note action and supporting records'));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm credit note reversal' }));
  expect(await screen.findByText('Credit note reversed')).toBeInTheDocument();
  expect(screen.getByText('CN-001')).toBeInTheDocument();
});
it('offers a read retry after a failed load without issuing a credit', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'UNAVAILABLE', message: 'Ledger unavailable' } }), { status: 503 }));
  render(<InvoiceCreditNotesPanel invoiceId={invoiceId} currency="NZD" />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong on our side.');
  fireEvent.click(screen.getByRole('button', { name: 'Reload credit notes' }));
  expect(await screen.findByText('No credit notes recorded for this invoice')).toBeInTheDocument();
  expect(calls.some((call) => call.path === '/api/credit-notes' && call.body)).toBe(false);
});

it('recovers an uncertain issued credit across remount with its original key and exact body', async () => {
  failIssueOnce = true;
  const first = render(<InvoiceCreditNotesPanel invoiceId={invoiceId} currency="NZD" />);
  await screen.findByText('No credit notes recorded for this invoice');
  fireEvent.change(screen.getByLabelText('Credit note reason'), { target: { value: 'Returned consulting service' } });
  fireEvent.change(screen.getByLabelText('Credit line amount'), { target: { value: '200.00' } });
  fireEvent.click(screen.getByLabelText('I have checked this credit against the original invoice and its GST treatment'));
  fireEvent.click(screen.getByRole('button', { name: 'Issue credit note' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Connection lost');
  first.unmount();
  render(<InvoiceCreditNotesPanel invoiceId={invoiceId} currency="NZD" />);
  await screen.findByText('CN-001');
  expect(screen.getByLabelText('Credit line amount')).toHaveValue('200.00');
  expect(screen.getByLabelText('Credit line amount')).toBeDisabled();
  fireEvent.click(screen.getByLabelText('I have checked this credit against the original invoice and its GST treatment'));
  fireEvent.click(screen.getByRole('button', { name: 'Retry pending credit note' }));
  await screen.findByText('Credit note issued');
  const writes = calls.filter((call) => call.path === '/api/credit-notes' && call.body);
  expect(writes).toHaveLength(2); expect(writes[1].key).toBe(writes[0].key); expect(writes[1].body).toEqual(writes[0].body);
});

it('recovers an uncertain refund even when its credit now has zero available balance', async () => {
  failRefundOnce = true;
  notes = [{ ...note, receivableAmount: '0.00', baseReceivableAmount: '0.00', customerCreditAmount: '230.00', baseCustomerCreditAmount: '230.00', refundAvailable: '230.00' }];
  const first = render(<InvoiceCreditNotesPanel invoiceId={invoiceId} currency="NZD" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Refund CN-001' }));
  await screen.findByRole('option', { name: 'Operating NZD' });
  fireEvent.change(screen.getByLabelText('Refund paid from account'), { target: { value: id('4') } });
  fireEvent.click(screen.getByLabelText('I have reviewed this credit note action and supporting records'));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm customer refund' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Connection lost');
  first.unmount(); render(<InvoiceCreditNotesPanel invoiceId={invoiceId} currency="NZD" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Resume pending refund CN-001' }));
  await screen.findByRole('option', { name: 'Operating NZD' });
  expect(screen.getByLabelText('Customer refund amount')).toHaveValue('230.00');
  expect(screen.getByLabelText('Customer refund amount')).toBeDisabled();
  fireEvent.click(screen.getByLabelText('I have reviewed this credit note action and supporting records'));
  fireEvent.click(screen.getByRole('button', { name: 'Retry customer refund' }));
  await screen.findByText('Customer refund recorded');
  const writes = calls.filter((call) => call.path.endsWith('/refunds'));
  expect(writes).toHaveLength(2); expect(writes[1].key).toBe(writes[0].key); expect(writes[1].body).toEqual(writes[0].body);
});
it('does not offer a new credit against a draft or cancelled invoice', async () => {
  render(<InvoiceCreditNotesPanel invoiceId={invoiceId} currency="NZD" canIssue={false} />);
  await screen.findByText('No credit notes recorded for this invoice');
  fireEvent.change(screen.getByLabelText('Credit note reason'), { target: { value: 'Returned consulting service' } });
  fireEvent.change(screen.getByLabelText('Credit line amount'), { target: { value: '200.00' } });
  fireEvent.click(screen.getByLabelText('I have checked this credit against the original invoice and its GST treatment'));
  expect(screen.getByRole('button', { name: 'Issue credit note' })).toBeDisabled();
  expect(screen.getByText('Issue the original invoice before creating a credit note. Draft and cancelled invoices cannot receive new credits.')).toBeInTheDocument();
});
