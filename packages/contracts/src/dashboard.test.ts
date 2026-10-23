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

  it('distinguishes ledger-authoritative widgets from operational activity', () => {
    const reports = widgets.map(({ kind }) => ({
      type: kind,
      filters,
      authority: kind === 'activity'
        ? { status: 'operational', source: 'operational_records', message: 'Recent source-record activity.' }
        : { status: 'authoritative', source: 'posted_ledger', message: 'Calculated from posted journal entries.' },
      metrics: [{ key: 'total', label: 'Total', value: '12.34', comparisonValue: '10.00', currency: 'NZD' }],
      rows: [],
    }));
    const parsed = dashboardResponseSchema.parse({
      layout: { id: crypto.randomUUID(), name: 'Default', isDefault: true, filters, widgets, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      reports,
    });
    expect(parsed.reports.filter((report) => report.type !== 'activity').every((report) => report.authority.status === 'authoritative')).toBe(true);
    expect(parsed.reports.find((report) => report.type === 'activity')?.authority.status).toBe('operational');
  });
});
