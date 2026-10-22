import { afterEach, describe, expect, it, vi } from 'vitest';
import { dashboardApi } from './dashboardApi';

const filters = { from: '2026-10-01', to: '2026-10-31', comparison: 'previous_period' as const };
const widgets = ['summary', 'receivables', 'payables', 'cash', 'tax', 'activity'].map((kind, order) => ({ kind, order, visible: true, size: 'medium' }));
const payload = {
  layout: { id: crypto.randomUUID(), name: 'Mine', isDefault: true, filters, widgets, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  reports: widgets.map(({ kind }) => ({ type: kind, filters, authority: { status: 'provisional', dependency: 'AKP-05', message: 'Pending ledger authority.' }, metrics: [], rows: [] })),
};

afterEach(() => vi.restoreAllMocks());

describe('dashboardApi', () => {
  it('serialises shareable dashboard filters and validates the response', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));
    const response = await dashboardApi.getDashboard(filters);
    expect(response.layout.name).toBe('Mine');
    expect(fetchMock).toHaveBeenCalledWith('/api/dashboard?from=2026-10-01&to=2026-10-31&comparison=previous_period', expect.objectContaining({ credentials: 'include' }));
  });
});
