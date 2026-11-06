import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GstPreparationPanel } from './GstPreparationPanel';
import { CompanyTaxPreparationPanel } from './CompanyTaxPreparationPanel';

const gst = { basis: 'payments', from: '2026-04-01', to: '2026-04-30', baseCurrency: 'NZD', totalSales: '1380.00', totalPurchases: '349.00', gstOnSales: '180.00', gstOnPurchases: '39.00', netGstPosition: '141.00', warnings: [] };
const company = { from: '2026-04-01', to: '2026-04-30', entityType: 'nz_company', baseCurrency: 'NZD', taxRate: '28', accountingProfit: '850.00', addBacks: '50.00', deductions: '20.00', taxAdjustedProfit: '880.00', lossesApplied: '100.00', lossesCarriedForward: '0.00', taxableIncome: '780.00', incomeTax: '218.40', taxCredits: '20.00', incomeTaxPayable: '198.40', excessCredits: '0.00', adjustments: [], lossesBroughtForward: '100.00', preparedAt: '2026-05-01T00:00:00.000Z', preparedBy: 'owner', warnings: ['Accountant review required.'] };
const calls: Array<{ path: string; body?: Record<string, unknown>; key?: string }> = [];
let fail = false;
let requiresReview = false;
let failDraftOnce = false;
let saved: Record<string, unknown>;
function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }); }
beforeEach(() => {
  calls.length = 0; fail = false; requiresReview = false; failDraftOnce = false;
  vi.stubGlobal('fetch', vi.fn(async (path: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
    calls.push({ path, body, key: new Headers(init?.headers).get('Idempotency-Key') ?? undefined });
    if (fail) return response({ error: { code: 'UNAVAILABLE', message: 'Ledger unavailable' } }, 503);
    if (path.includes('company-income-tax-preparation')) return response(company);
    if (path.includes('gst-preparation')) return response(body ? { ...gst, gstOnSales: '165.00', netGstPosition: '126.00', review: { confirmed: true, reviewedAt: '2026-05-01T00:00:00.000Z', reviewedBy: 'owner', adjustments: body.adjustments, unadjustedGstOnSales: '180.00', unadjustedGstOnPurchases: '39.00' } } : { ...gst, requiresReview });
    if (path === '/api/tax-returns') {
      if (failDraftOnce) { failDraftOnce = false; throw new TypeError('Connection lost'); }
      saved = { ...body, id: '11111111-1111-4111-8111-111111111111', createdAt: '2026-05-01T00:00:00.000Z', updatedAt: '2026-05-01T00:00:00.000Z', submittedAt: null, irdReference: null };
      return response(saved, 201);
    }
    return response(saved);
  }));
});
function period(prefix: string) {
  fireEvent.change(screen.getByLabelText(`${prefix} period start`), { target: { value: '2026-04-01' } });
  fireEvent.change(screen.getByLabelText(`${prefix} period end`), { target: { value: '2026-04-30' } });
}
describe('exact tax preparation', () => {
  it('loads payments-basis GST 180 minus 39 equals 141 and preserves basis in a reloaded draft', async () => {
    render(<GstPreparationPanel />); period('GST');
    fireEvent.change(screen.getByLabelText('Registered GST basis'), { target: { value: 'payments' } });
    fireEvent.change(screen.getByLabelText('GST due date (confirm in myIR)'), { target: { value: '2026-05-28' } });
    fireEvent.click(screen.getByRole('button', { name: 'Prepare GST worksheet' }));
    expect(await screen.findByText('NZD 141.00')).toBeInTheDocument();
    expect(calls[0].path).toContain('basis=payments');
    fireEvent.click(screen.getByLabelText('I have reviewed the worksheet and bank reconciliation'));
    fireEvent.click(screen.getByRole('button', { name: 'Save GST worksheet draft' }));
    expect(await screen.findByText('GST draft saved and reloaded')).toBeInTheDocument();
    expect(saved.netGst).toBe('141.00');
    expect(saved.returnData).toMatchObject({ preparation: { basis: 'payments', baseCurrency: 'NZD', dueDate: '2026-05-28' } });
    fireEvent.change(screen.getByLabelText('Registered GST basis'), { target: { value: 'invoice' } });
    expect(screen.queryByText('NZD 141.00')).not.toBeInTheDocument();
  });
  it('retries an uncertain draft save with the same idempotency key and exact body', async () => {
    render(<GstPreparationPanel />);
    fireEvent.change(screen.getByLabelText('GST due date (confirm in myIR)'), { target: { value: '2026-05-28' } });
    fireEvent.click(screen.getByRole('button', { name: 'Prepare GST worksheet' }));
    await screen.findByText('NZD 141.00');
    fireEvent.click(screen.getByLabelText('I have reviewed the worksheet and bank reconciliation'));
    failDraftOnce = true;
    fireEvent.click(screen.getByRole('button', { name: 'Save GST worksheet draft' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Connection lost');
    fireEvent.click(screen.getByRole('button', { name: 'Save GST worksheet draft' }));
    await screen.findByText('GST draft saved and reloaded');
    const writes = calls.filter((call) => call.path === '/api/tax-returns');
    expect(writes).toHaveLength(2);
    expect(writes[0].key).toEqual(expect.any(String));
    expect(writes[1].key).toBe(writes[0].key);
    expect(writes[1].body).toEqual(writes[0].body);
  });
  it('blocks saving when fresh preparation starts requiring source review without changing the total', async () => {
    render(<GstPreparationPanel />);
    fireEvent.change(screen.getByLabelText('GST due date (confirm in myIR)'), { target: { value: '2026-05-28' } });
    fireEvent.click(screen.getByRole('button', { name: 'Prepare GST worksheet' }));
    await screen.findByText('NZD 141.00');
    fireEvent.click(screen.getByLabelText('I have reviewed the worksheet and bank reconciliation'));
    requiresReview = true;
    fireEvent.click(screen.getByRole('button', { name: 'Save GST worksheet draft' }));
    expect(await screen.findByText('The books changed. Review the refreshed worksheet before saving.')).toBeInTheDocument();
    expect(calls.some((call) => call.path === '/api/tax-returns')).toBe(false);
  });
  it('requires source, reason and review before applying a signed GST adjustment', async () => {
    render(<GstPreparationPanel />); period('GST');
    fireEvent.click(screen.getByRole('button', { name: 'Add GST adjustment' }));
    fireEvent.change(screen.getByLabelText('GST adjustment amount 1'), { target: { value: '-15.00' } });
    fireEvent.change(screen.getByLabelText('GST gross adjustment 1 (optional)'), { target: { value: '-115.00' } });
    fireEvent.change(screen.getByLabelText('GST adjustment reason 1'), { target: { value: 'Credit note for returned service' } });
    fireEvent.change(screen.getByLabelText('GST adjustment source 1'), { target: { value: 'CN-001' } });
    expect(screen.getByRole('button', { name: 'Prepare GST worksheet' })).toBeDisabled();
    fireEvent.click(screen.getByLabelText('I have reviewed the adjustment sources and tax treatment'));
    fireEvent.click(screen.getByRole('button', { name: 'Prepare GST worksheet' }));
    expect(await screen.findByText('NZD 126.00')).toBeInTheDocument();
    expect(calls[0].body).toMatchObject({ reviewConfirmed: true, adjustments: [{ kind: 'output', amount: '-15.00', grossAdjustment: '-115.00', reason: 'Credit note for returned service', sourceReference: 'CN-001' }] });
  });
  it('shows an actionable ledger error and never leaves a stale save action', async () => {
    fail = true; render(<GstPreparationPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Prepare GST worksheet' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong on our side.');
    expect(screen.queryByRole('button', { name: 'Save GST worksheet draft' })).not.toBeInTheDocument();
  });
  it('requires explicit GST source review when the backend flags foreign conversion policy', async () => {
    requiresReview = true; render(<GstPreparationPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Prepare GST worksheet' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('require source review');
    fireEvent.click(screen.getByLabelText('I have reviewed the adjustment sources and tax treatment'));
    fireEvent.click(screen.getByRole('button', { name: 'Prepare GST worksheet' }));
    await screen.findByText('NZD 126.00');
    expect(calls[1].body).toMatchObject({ reviewConfirmed: true, adjustments: [] });
  });
  it('explains an invalid period without exposing schema implementation details', async () => {
    render(<GstPreparationPanel />);
    fireEvent.change(screen.getByLabelText('GST period start'), { target: { value: '2026-04-30' } });
    fireEvent.change(screen.getByLabelText('GST period end'), { target: { value: '2026-04-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Prepare GST worksheet' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose valid dates with the period start on or before its end.');
    expect(calls).toHaveLength(0);
  });
  it('requires explicit company-rate confirmation and displays authoritative tax 198.40', async () => {
    render(<CompanyTaxPreparationPanel />); period('Company tax');
    fireEvent.change(screen.getByLabelText('Available losses brought forward (NZD)'), { target: { value: '100.00' } });
    fireEvent.change(screen.getByLabelText('Available tax credits (NZD)'), { target: { value: '20.00' } });
    expect(screen.getByRole('button', { name: 'Prepare company tax worksheet' })).toBeDisabled();
    fireEvent.click(screen.getByLabelText('I confirm this is an ordinary NZ company eligible for the 28% rate'));
    fireEvent.click(screen.getByRole('button', { name: 'Prepare company tax worksheet' }));
    expect(await screen.findByText('NZD 198.40')).toBeInTheDocument();
    expect(screen.getByText('NZD 780.00')).toBeInTheDocument();
    expect(calls[0].body).toMatchObject({ entityType: 'nz_company', rateConfirmed: true, taxRate: '28', lossesBroughtForward: '100.00', taxCredits: '20.00' });
    fireEvent.click(screen.getByRole('button', { name: 'Save company tax draft' }));
    expect(await screen.findByText('Company tax draft saved and reloaded')).toBeInTheDocument();
    expect(saved.returnData).toMatchObject({ companyIncomeTax: { incomeTaxPayable: '198.40', taxableIncome: '780.00' } });
  });
});

it('requires explicit supported classification before sending zero-rated or exempt sales evidence', async () => {
  render(<GstPreparationPanel />);
  fireEvent.click(screen.getByLabelText('I need to classify zero-rated or exempt sales'));
  fireEvent.change(screen.getByLabelText('Reviewed zero-rated sales'), { target: { value: '100.00' } });
  fireEvent.change(screen.getByLabelText('Reviewed exempt sales'), { target: { value: '50.00' } });
  fireEvent.change(screen.getByLabelText('Sales classification reason'), { target: { value: 'Reviewed export and exempt source records' } });
  fireEvent.change(screen.getByLabelText('Sales classification source'), { target: { value: 'GST-SALES-REVIEW' } });
  expect(screen.getByRole('button', { name: 'Prepare GST worksheet' })).toBeDisabled();
  fireEvent.click(screen.getByLabelText('I have reviewed the adjustment sources and tax treatment'));
  fireEvent.click(screen.getByRole('button', { name: 'Prepare GST worksheet' }));
  await screen.findByText('NZD 126.00');
  expect(calls.find(call => call.body?.salesClassificationReview)?.body).toMatchObject({ salesClassificationReview: { zeroRatedSales: '100.00', exemptSales: '50.00', reason: 'Reviewed export and exempt source records', sourceReference: 'GST-SALES-REVIEW' } });
});
it('uses the persisted hybrid basis and server-generated period without an editable per-return override', () => {
  render(<GstPreparationPanel registeredBasis="hybrid" period={{ periodStart: '2026-11-01', periodEnd: '2026-11-30', dueDate: '2027-01-15' }} />);
  expect(screen.getByLabelText('Registered GST basis')).toHaveValue('hybrid');
  expect(screen.getByLabelText('Registered GST basis')).toBeDisabled();
  expect(screen.getByLabelText('GST period start')).toHaveValue('2026-11-01');
  expect(screen.getByLabelText('GST period start')).toBeDisabled();
  expect(screen.getByLabelText('GST due date (confirm in myIR)')).toHaveValue('2027-01-15');
});
it('allows read-only GST preview but prevents review and draft mutation controls', async () => {
  render(<GstPreparationPanel registeredBasis="payments" canWrite={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'Prepare GST worksheet' }));
  await screen.findByText('NZD 141.00');
  expect(screen.getByLabelText('I need to classify zero-rated or exempt sales')).toBeDisabled();
  expect(screen.getByLabelText('I have reviewed the worksheet and bank reconciliation')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Save GST worksheet draft' })).toBeDisabled();
  expect(calls.some(call => call.body)).toBe(false);
});
