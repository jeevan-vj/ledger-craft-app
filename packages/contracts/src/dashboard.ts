import { z } from 'zod';

const money = z.string().regex(/^-?\d+(\.\d+)?$/);
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const dashboardWidgetKindSchema = z.enum([
  'summary',
  'receivables',
  'payables',
  'cash',
  'tax',
  'activity',
]);

export const dashboardComparisonSchema = z.enum(['none', 'previous_period', 'previous_year']);

export const reportFiltersSchema = z.object({
  from: dateOnly,
  to: dateOnly,
  comparison: dashboardComparisonSchema.default('previous_period'),
}).strict().refine((value) => value.from <= value.to, {
  message: 'From date must not be after to date',
  path: ['to'],
});

export const reportAuthoritySchema = z.object({
  status: z.enum(['authoritative', 'operational']),
  source: z.enum(['posted_ledger', 'operational_records']),
  message: z.string().min(1),
});

export const reportMetricSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  value: money,
  comparisonValue: money.nullable(),
  currency: z.string().min(3).max(3),
});

export const reportRowSchema = z.object({
  id: z.string().min(1),
  date: dateOnly,
  label: z.string().min(1),
  detail: z.string().nullable(),
  value: money.nullable(),
  route: z.string().nullable(),
});

export const reportResultSchema = z.object({
  type: dashboardWidgetKindSchema,
  filters: reportFiltersSchema,
  authority: reportAuthoritySchema,
  metrics: z.array(reportMetricSchema),
  rows: z.array(reportRowSchema),
});

export const dashboardWidgetPreferenceSchema = z.object({
  kind: dashboardWidgetKindSchema,
  visible: z.boolean(),
  order: z.number().int().min(0).max(20),
  size: z.enum(['small', 'medium', 'large']),
}).strict();

const dashboardWidgetsSchema = z.array(dashboardWidgetPreferenceSchema).length(6).superRefine((widgets, ctx) => {
  if (new Set(widgets.map((widget) => widget.kind)).size !== widgets.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Each dashboard widget may appear only once' });
  }
  if (new Set(widgets.map((widget) => widget.order)).size !== widgets.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Each dashboard widget order must be unique' });
  }
});

export const dashboardLayoutSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(80),
  isDefault: z.boolean(),
  filters: reportFiltersSchema,
  widgets: dashboardWidgetsSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const saveDashboardLayoutRequestSchema = z.object({
  name: z.string().trim().min(1).max(80),
  isDefault: z.boolean().default(false),
  filters: reportFiltersSchema,
  widgets: dashboardWidgetsSchema,
}).strict();

export const dashboardResponseSchema = z.object({
  layout: dashboardLayoutSchema,
  reports: z.array(reportResultSchema).length(6),
});

export const dashboardLayoutListResponseSchema = z.object({ layouts: z.array(dashboardLayoutSchema) });

export const savedReportDefinitionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  reportType: dashboardWidgetKindSchema,
  filters: reportFiltersSchema,
  isPinned: z.boolean(),
  isArchived: z.boolean(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const createSavedReportRequestSchema = z.object({
  name: z.string().trim().min(1).max(100),
  reportType: dashboardWidgetKindSchema,
  filters: reportFiltersSchema,
  isPinned: z.boolean().default(false),
}).strict();

export const updateSavedReportRequestSchema = createSavedReportRequestSchema.partial().extend({
  isArchived: z.boolean().optional(),
}).strict();

export const savedReportListResponseSchema = z.object({ reports: z.array(savedReportDefinitionSchema) });

export type DashboardWidgetKind = z.infer<typeof dashboardWidgetKindSchema>;
export type ReportFilters = z.infer<typeof reportFiltersSchema>;
export type ReportResultDto = z.infer<typeof reportResultSchema>;
export type DashboardWidgetPreference = z.infer<typeof dashboardWidgetPreferenceSchema>;
export type DashboardLayoutDto = z.infer<typeof dashboardLayoutSchema>;
export type SaveDashboardLayoutRequest = z.infer<typeof saveDashboardLayoutRequestSchema>;
export type DashboardResponse = z.infer<typeof dashboardResponseSchema>;
export type SavedReportDefinitionDto = z.infer<typeof savedReportDefinitionSchema>;
export type CreateSavedReportRequest = z.infer<typeof createSavedReportRequestSchema>;
export type UpdateSavedReportRequest = z.infer<typeof updateSavedReportRequestSchema>;
