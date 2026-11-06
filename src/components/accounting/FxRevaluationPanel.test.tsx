import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrencySettingsDto } from '@ledgercraft/contracts';
import { FxRevaluationPanel } from './FxRevaluationPanel';

const rateId = '11111111-1111-4111-8111-111111111111';
const settings: CurrencySettingsDto = {
  localization: { baseCurrency: 'NZD', locale: 'en-NZ', language: 'en', timezone: 'Pacific/Auckland', dateFormat: 'DD/MM/YYYY', numberFormat: '1,234.56', financialYearStartMonth: 4, financialYearStartDay: 1, percentPosition: 'after' },
  currencies: [{ code: 'NZD', name: 'New Zealand dollar', precision: 2, symbol: '$', symbolPosition: 'before', enabled: true, isBase: true }, { code: 'USD', name: 'US dollar', precision: 2, symbol: '$', symbolPosition: 'before', enabled: true, isBase: false }],
  rates: [{ id: rateId, currencyCode: 'USD', baseCurrency: 'NZD', effectiveDate: '2026-10-31', rate: '1.70', usageCount: 0, immutable: true, createdAt: '2026-10-31T00:00:00Z', createdByUserId: rateId }, { id: '22222222-2222-4222-8222-222222222222', currencyCode: 'USD', baseCurrency: 'NZD', effectiveDate: '2026-11-01', rate: '1.80', usageCount: 0, immutable: true, createdAt: '2026-11-01T00:00:00Z', createdByUserId: rateId }],
};
const prepared = {
  asOfDate: '2026-10-31', reversalDate: '2026-11-01', baseCurrency: 'NZD',
  positions: [{ documentType: 'invoice', documentId: rateId, documentNumber: 'INV-USD-100', currency: 'USD', foreignOutstanding: '100.00', bookBaseAmount: '160.00', revaluedBaseAmount: '170.00', exchangeDifference: '10.00', exchangeRateId: rateId, exchangeRate: '1.70' }],
  unrealizedGain: '10.00', unrealizedLoss: '0.00', warnings: [], journalEntryIds: [], reversalJournalEntryIds: [], replayed: false,
};
const posted = { ...prepared, journalEntryIds: ['33333333-3333-4333-8333-333333333333'], reversalJournalEntryIds: ['44444444-4444-4444-8444-444444444444'] };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
let calls: Array<{ path: string; body: Record<string, unknown> }>;
beforeEach(() => {
  calls = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ path: String(input), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    return response(String(input).endsWith('/preview') ? prepared : posted, String(input).endsWith('/preview') ? 200 : 201);
  }));
});
afterEach(() => vi.unstubAllGlobals());
function fill() {
  fireEvent.change(screen.getByLabelText('FX valuation date'), { target: { value: '2026-10-31' } });
  fireEvent.change(screen.getByLabelText('FX revaluation reason'), { target: { value: 'October closing rate reviewed against source' } });
  fireEvent.change(screen.getByLabelText('Reviewed closing rate for USD'), { target: { value: rateId } });
}

describe('reviewed period-end FX revaluation', () => {
  it('requires an explicit dated rate and reason instead of guessing a closing rate', () => {
    render(<FxRevaluationPanel settings={settings} />);
    expect(screen.getByRole('button', { name: 'Preview FX revaluation' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('FX valuation date'), { target: { value: '2026-10-31' } });
    expect(screen.getByLabelText('Reviewed closing rate for USD')).toHaveValue('');
    expect(screen.queryByRole('option', { name: /1.80/ })).not.toBeInTheDocument();
    fill();
    expect(screen.getByRole('button', { name: 'Preview FX revaluation' })).toBeEnabled();
  });
  it('previews authoritative AR160 to170, then posts reviewed journals and the dated next-day reversal', async () => {
    render(<FxRevaluationPanel settings={settings} />); fill();
    fireEvent.click(screen.getByRole('button', { name: 'Preview FX revaluation' }));
    expect(await screen.findByText('NZD 170.00')).toBeInTheDocument();
    expect(screen.getByText('NZD 160.00')).toBeInTheDocument();
    expect(screen.getByText('Next-day reversal: 2026-11-01')).toBeInTheDocument();
    const commit = screen.getByRole('button', { name: 'Post reviewed FX revaluation' });
    expect(commit).toBeDisabled();
    fireEvent.click(screen.getByLabelText('I have reviewed the rates, open balances and next-day reversals'));
    fireEvent.click(commit);
    expect(await screen.findByText('FX revaluation posted')).toBeInTheDocument();
    expect(calls.map((call) => call.path)).toEqual(['/api/fx-revaluations/preview', '/api/fx-revaluations/preview', '/api/fx-revaluations']);
    expect(calls[2].body).toEqual({ asOfDate: '2026-10-31', exchangeRateIds: [rateId], reason: 'October closing rate reviewed against source', reviewed: true });
    expect(screen.getByText(posted.journalEntryIds[0])).toBeInTheDocument();
    expect(screen.getByText(posted.reversalJournalEntryIds[0])).toBeInTheDocument();
    expect(commit).toBeDisabled();
    fireEvent.change(screen.getByLabelText('FX valuation date'), { target: { value: '2026-10-30' } });
    expect(screen.queryByText('NZD 170.00')).not.toBeInTheDocument();
    expect(screen.queryByText('FX revaluation posted')).not.toBeInTheDocument();
  });
  it('does not post when open balances changed after preview', async () => {
    let count = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ path: String(input), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
      count++;
      return response(count === 1 ? prepared : { ...prepared, unrealizedGain: '11.00', positions: [{ ...prepared.positions[0], revaluedBaseAmount: '171.00', exchangeDifference: '11.00' }] });
    }));
    render(<FxRevaluationPanel settings={settings} />); fill();
    fireEvent.click(screen.getByRole('button', { name: 'Preview FX revaluation' }));
    await screen.findByText('NZD 170.00');
    fireEvent.click(screen.getByLabelText('I have reviewed the rates, open balances and next-day reversals'));
    fireEvent.click(screen.getByRole('button', { name: 'Post reviewed FX revaluation' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('changed');
    expect(await screen.findByText('NZD 171.00')).toBeInTheDocument();
    expect(screen.getByLabelText('I have reviewed the rates, open balances and next-day reversals')).not.toBeChecked();
    expect(calls).toHaveLength(2);
    expect(calls.every((call) => call.path.endsWith('/preview'))).toBe(true);
  });
  it('handles an empty ledger and exposes no posting action', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ ...prepared, positions: [], unrealizedGain: '0.00' })));
    render(<FxRevaluationPanel settings={settings} />); fill();
    fireEvent.click(screen.getByRole('button', { name: 'Preview FX revaluation' }));
    expect(await screen.findByText('No foreign receivables or payables are open at this date.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Post reviewed FX revaluation' })).not.toBeInTheDocument();
  });
  it('shows loading and recoverable errors without keeping stale posting controls', async () => {
    let finish: (value: Response) => void = () => undefined;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; })));
    render(<FxRevaluationPanel settings={settings} />); fill();
    fireEvent.click(screen.getByRole('button', { name: 'Preview FX revaluation' }));
    expect(screen.getByRole('button', { name: 'Preparing FX preview…' })).toBeDisabled();
    expect(screen.getByLabelText('FX valuation date')).toBeDisabled();
    finish(response({ error: { code: 'UNAVAILABLE', message: 'Rates unavailable' } }, 503));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Post reviewed FX revaluation' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Preview FX revaluation' })).toBeEnabled());
  });
  it('explains missing reviewed rates before any request', () => {
    render(<FxRevaluationPanel settings={{ ...settings, rates: [] }} />);
    expect(screen.getByText(/Add a reviewed dated exchange rate/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preview FX revaluation' })).toBeDisabled();
    expect(calls).toEqual([]);
  });
});
