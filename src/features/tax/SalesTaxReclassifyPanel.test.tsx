import { describe, expect, it, vi, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SalesTaxReclassifyPanel } from './SalesTaxReclassifyPanel';

const line = { id: '55555555-5555-4555-8555-555555555555', invoiceId: '33333333-3333-4333-8333-333333333333', invoiceNumber: 'INV-9', date: '2026-09-22', description: 'Older export', total: '2000.00', taxCode: null };
const impact = { unclassifiedSales: '2000.00', zeroRatedSales: '0.00', exemptSales: '0.00', mappingStatus: 'requires_confirmation' as const, totalSales: '2000.00', box5: null, box6: null };
const after = { ...impact, box5: '2000.00', box6: '2000.00', unclassifiedSales: '0.00', zeroRatedSales: '2000.00', mappingStatus: 'supported' as const };

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
}

describe('sales tax reclassify panel', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('previews the Box 5 and Box 6 change and applies the chosen code', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/preview')) return json({ taxCode: 'zero_rated', lineCount: 1, before: impact, after });
      if (init?.method === 'POST') return json({ id: '77777777-7777-4777-8777-777777777777', action: 'apply', taxCode: 'zero_rated', reason: 'Reviewed export documents', lineIds: [line.id], before: impact, after, undoneAt: null, createdAt: '2026-11-11T00:00:00.000Z' }, 201);
      return json({ lines: [line], events: [] });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<SalesTaxReclassifyPanel canWrite />);
    expect(await screen.findByText(/Older export/)).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: /INV-9 Older export/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Preview Box 5 and 6' }));
    expect(await screen.findByText(/Box 6: Not shown until every untaxed sale is classified → 2000.00/)).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Reviewed export documents' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply tax codes' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/Box 5 and Box 6/));
    const applyCall = fetchMock.mock.calls.find((call) => String(call[0]).endsWith('/api/tax/sales-tax-reclassifications') && call[1]?.method === 'POST');
    expect(JSON.parse(String(applyCall?.[1]?.body))).toMatchObject({ lineIds: [line.id], taxCode: 'zero_rated', reason: 'Reviewed export documents' });
  });
});
