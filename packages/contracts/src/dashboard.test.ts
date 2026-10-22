import { describe, expect, it } from 'vitest';
import {
  createSavedReportRequestSchema,
  dashboardResponseSchema,
  reportFiltersSchema,
  saveDashboardLayoutRequestSchema,
} from './dashboard';

const filters = { from: '2026-10-01', to: '2026-10-31', comparison: 'previous_period' as const };
const widgets = ['summary', 'receivables', 'payables', 'cash', 'tax', 'activity'].map((kind, order) => ({
  kind,
  order,
  visible: true,
  size: order === 0 ? 'large' : 'medium',
}));

describe('dashboard contracts', () => {
  it('validates a date range and rejects reversed dates', () => {
    expect(reportFiltersSchema.parse(filters)).toEqual(filters);
    expect(reportFiltersSchema.safeParse({ ...filters, from: '2026-11-01' }).success).toBe(false);
  });

  it('requires one uniquely ordered preference for every core widget', () => {
    expect(saveDashboardLayoutRequestSchema.parse({ name: 'Owner view', isDefault: true, filters, widgets }).widgets).toHaveLength(6);
    expect(saveDashboardLayoutRequestSchema.safeParse({ name: 'Broken', filters, widgets: widgets.slice(0, 5) }).success).toBe(false);
    expect(saveDashboardLayoutRequestSchema.safeParse({ name: 'Broken', filters, widgets: widgets.map((widget) => ({ ...widget, order: 0 })) }).success).toBe(false);
  });

  it('keeps saved report ownership out of client writes', () => {
    expect(createSavedReportRequestSchema.parse({ name: 'October cash', reportType: 'cash', filters })).toMatchObject({ reportType: 'cash' });
    expect(createSavedReportRequestSchema.safeParse({ name: 'Leak', reportType: 'cash', filters, organisationId: crypto.randomUUID() }).success).toBe(false);
  });

  it('marks operational dashboard figures as provisional until AKP-05', () => {
    const reports = widgets.map(({ kind }) => ({
      type: kind,
      filters,
      authority: { status: 'provisional', dependency: 'AKP-05', message: 'Operational data; ledger authority is pending.' },
      metrics: [{ key: 'total', label: 'Total', value: '12.34', comparisonValue: '10.00', currency: 'NZD' }],
      rows: [],
    }));
    const parsed = dashboardResponseSchema.parse({
      layout: { id: crypto.randomUUID(), name: 'Default', isDefault: true, filters, widgets, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      reports,
    });
    expect(parsed.reports.every((report) => report.authority.dependency === 'AKP-05')).toBe(true);
  });
});
