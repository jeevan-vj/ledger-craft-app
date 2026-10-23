import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import { Archive, ArrowDown, ArrowUp, Copy, Download, FileDown, Pin, Plus, Printer, RefreshCw, Save, Settings2 } from 'lucide-react';
import type { DashboardWidgetKind, DashboardWidgetPreference, ReportFilters, ReportResultDto, SavedReportDefinitionDto } from '@ledgercraft/contracts';
import { dashboardApi } from '@/features/dashboard/api/dashboardApi';
import { PageHeader } from '@/components/layout/PageHeader';
import { ContentPanel } from '@/components/ui/ContentPanel';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const titles: Record<DashboardWidgetKind, string> = {
  summary: 'Business summary', receivables: 'Receivables', payables: 'Payables',
  cash: 'Cash position', tax: 'Tax estimate', activity: 'Recent activity',
};

function initialRange(): ReportFilters {
  const now = new Date();
  return { from: `${now.getUTCFullYear()}-01-01`, to: now.toISOString().slice(0, 10), comparison: 'previous_period' };
}

function money(value: string, currency = 'NZD') {
  return new Intl.NumberFormat('en-NZ', { style: 'currency', currency }).format(Number(value));
}

function displayMetric(report: ReportResultDto, value: string, currency: string) {
  return report.type === 'activity' ? Number(value).toFixed(0) : money(value, currency);
}

function downloadCsv(report: ReportResultDto) {
  const rows = [['date', 'label', 'detail', 'value'], ...report.rows.map((row) => [row.date, row.label, row.detail ?? '', row.value ?? ''])];
  const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n');
  const href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = `${report.type}-${report.filters.from}-${report.filters.to}.csv`;
  anchor.click();
  URL.revokeObjectURL(href);
}

function downloadPdf(report: ReportResultDto) {
  const document = new jsPDF();
  document.setFontSize(18);
  document.text(titles[report.type], 18, 20);
  document.setFontSize(10);
  document.text(`${report.filters.from} to ${report.filters.to}`, 18, 29);
  let y = 42;
  report.metrics.forEach((item) => { document.text(`${item.label}: ${money(item.value, item.currency)}`, 18, y); y += 8; });
  report.rows.slice(0, 24).forEach((row) => {
    document.text(`${row.date}  ${row.label}  ${row.value ?? ''}`, 18, y);
    y += 7;
    if (y > 275) { document.addPage(); y = 20; }
  });
  document.save(`${report.type}-${report.filters.from}-${report.filters.to}.pdf`);
}

function ReportCard({ report, preference, onSave }: { report: ReportResultDto; preference: DashboardWidgetPreference; onSave: (type: DashboardWidgetKind) => void }) {
  return (
    <ContentPanel className={cn('print:break-inside-avoid', preference.size === 'large' && 'lg:col-span-2')}>
      <div className="flex items-start justify-between gap-4">
        <div><h2 className="text-lg font-semibold">{titles[report.type]}</h2><p className="mt-1 text-xs text-muted-foreground">{report.filters.from} – {report.filters.to}</p></div>
        <div className="flex gap-1 print:hidden">
          <button type="button" className="rounded-full p-2 hover:bg-muted" aria-label={`Save ${titles[report.type]} report`} onClick={() => onSave(report.type)}><Save className="h-4 w-4" /></button>
          <button type="button" className="rounded-full p-2 hover:bg-muted" aria-label={`Export ${titles[report.type]} as CSV`} onClick={() => downloadCsv(report)}><Download className="h-4 w-4" /></button>
          <button type="button" className="rounded-full p-2 hover:bg-muted" aria-label={`Export ${titles[report.type]} as PDF`} onClick={() => downloadPdf(report)}><FileDown className="h-4 w-4" /></button>
        </div>
      </div>
      <div className={cn('mt-6 grid gap-5', report.metrics.length > 1 && 'sm:grid-cols-2')}>
        {report.metrics.map((metric) => <div key={metric.key}><p className="text-sm text-muted-foreground">{metric.label}</p><p className="mt-1 text-2xl font-bold tabular-nums">{displayMetric(report, metric.value, metric.currency)}</p>{metric.comparisonValue !== null && <p className="mt-1 text-xs text-muted-foreground">Previous {displayMetric(report, metric.comparisonValue, metric.currency)}</p>}</div>)}
      </div>
      {report.rows.length ? <div className="mt-6 divide-y divide-border border-t border-border">
        {report.rows.slice(0, preference.size === 'large' ? 8 : 4).map((row) => <div key={`${report.type}-${row.id}`} className="flex items-center justify-between gap-4 py-3 text-sm"><div className="min-w-0">{row.route ? <Link className="font-medium hover:underline" to={row.route}>{row.label}</Link> : <p className="font-medium">{row.label}</p>}<p className="truncate text-xs text-muted-foreground">{row.date}{row.detail ? ` · ${row.detail}` : ''}</p></div>{row.value !== null && <span className="shrink-0 font-medium tabular-nums">{money(row.value)}</span>}</div>)}
      </div> : <p className="mt-6 rounded-xl bg-muted/50 px-4 py-5 text-sm text-muted-foreground">No source activity in this period.</p>}
      <p className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground">{report.authority.status === 'authoritative' ? 'Server-authoritative · Posted ledger' : 'Operational activity'} · {report.authority.message}</p>
    </ContentPanel>
  );
}

function LayoutEditor({ widgets, onChange, onCancel, onSave, saving }: { widgets: DashboardWidgetPreference[]; onChange: (widgets: DashboardWidgetPreference[]) => void; onCancel: () => void; onSave: () => void; saving: boolean }) {
  const ordered = [...widgets].sort((a, b) => a.order - b.order);
  const update = (kind: DashboardWidgetKind, patch: Partial<DashboardWidgetPreference>) => onChange(widgets.map((widget) => widget.kind === kind ? { ...widget, ...patch } : widget));
  const move = (index: number, direction: -1 | 1) => {
    const other = ordered[index + direction]; const current = ordered[index];
    if (!current || !other) return;
    onChange(widgets.map((widget) => widget.kind === current.kind ? { ...widget, order: other.order } : widget.kind === other.kind ? { ...widget, order: current.order } : widget));
  };
  return <ContentPanel className="print:hidden" aria-label="Dashboard layout settings">
    <div className="flex items-center justify-between gap-4"><div><h2 className="text-lg font-semibold">Arrange your dashboard</h2><p className="text-sm text-muted-foreground">Visibility, order and card size are private to your user in this organisation.</p></div><Button variant="ghost" onClick={onCancel}>Close</Button></div>
    <div className="mt-5 divide-y divide-border">{ordered.map((widget, index) => <div key={widget.kind} className="grid gap-3 py-4 sm:grid-cols-[1fr_auto_auto] sm:items-center"><label className="flex items-center gap-3 font-medium"><input type="checkbox" checked={widget.visible} onChange={(event) => update(widget.kind, { visible: event.target.checked })} />{titles[widget.kind]}</label><select aria-label={`${titles[widget.kind]} size`} className="rounded-lg border border-input bg-background px-3 py-2 text-sm" value={widget.size} onChange={(event) => update(widget.kind, { size: event.target.value as DashboardWidgetPreference['size'] })}><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select><div className="flex gap-1"><button type="button" aria-label={`Move ${titles[widget.kind]} up`} disabled={index === 0} className="rounded-full p-2 hover:bg-muted disabled:opacity-30" onClick={() => move(index, -1)}><ArrowUp className="h-4 w-4" /></button><button type="button" aria-label={`Move ${titles[widget.kind]} down`} disabled={index === ordered.length - 1} className="rounded-full p-2 hover:bg-muted disabled:opacity-30" onClick={() => move(index, 1)}><ArrowDown className="h-4 w-4" /></button></div></div>)}</div>
    <Button onClick={onSave} disabled={saving}>{saving ? 'Saving…' : 'Save dashboard'}</Button>
  </ContentPanel>;
}

function SavedReports({ reports, onOpen, onChange, onDuplicate }: { reports: SavedReportDefinitionDto[]; onOpen: (report: SavedReportDefinitionDto) => void; onChange: (report: SavedReportDefinitionDto, patch: { name?: string; isPinned?: boolean; isArchived?: boolean }) => void; onDuplicate: (id: string) => void }) {
  return <ContentPanel className="print:hidden"><h2 className="text-lg font-semibold">Saved reports</h2><p className="mt-1 text-sm text-muted-foreground">Reusable filters for web and mobile.</p>{reports.length ? <div className="mt-5 divide-y divide-border">{reports.map((report) => <div key={report.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"><button type="button" className="text-left" onClick={() => onOpen(report)}><span className="font-medium">{report.name}</span><span className="block text-xs capitalize text-muted-foreground">{report.reportType} · {report.filters.from} – {report.filters.to}</span></button><div className="flex gap-1"><button type="button" className="rounded-full p-2 hover:bg-muted" aria-label={`${report.isPinned ? 'Unpin' : 'Pin'} ${report.name}`} onClick={() => onChange(report, { isPinned: !report.isPinned })}><Pin className={cn('h-4 w-4', report.isPinned && 'fill-current')} /></button><button type="button" className="rounded-full p-2 hover:bg-muted" aria-label={`Rename ${report.name}`} onClick={() => { const name = window.prompt('Report name', report.name)?.trim(); if (name) onChange(report, { name }); }}><Settings2 className="h-4 w-4" /></button><button type="button" className="rounded-full p-2 hover:bg-muted" aria-label={`Duplicate ${report.name}`} onClick={() => onDuplicate(report.id)}><Copy className="h-4 w-4" /></button><button type="button" className="rounded-full p-2 hover:bg-muted" aria-label={`Archive ${report.name}`} onClick={() => onChange(report, { isArchived: true })}><Archive className="h-4 w-4" /></button></div></div>)}</div> : <p className="mt-5 rounded-xl bg-muted/50 px-4 py-5 text-sm text-muted-foreground">Save a widget to reuse its date and comparison filters.</p>}</ContentPanel>;
}

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const requestedFilters: ReportFilters | undefined = from && to ? { from, to, comparison: (searchParams.get('comparison') as ReportFilters['comparison']) ?? 'previous_period' } : undefined;
  const layoutId = searchParams.get('layout') ?? undefined;
  const [editing, setEditing] = useState(false);
  const [draftWidgets, setDraftWidgets] = useState<DashboardWidgetPreference[]>([]);
  const dashboard = useQuery({ queryKey: ['dashboard', requestedFilters, layoutId], queryFn: () => dashboardApi.getDashboard({ ...requestedFilters, layoutId }) });
  const filters = requestedFilters ?? dashboard.data?.layout.filters ?? initialRange();
  const savedReports = useQuery({ queryKey: ['saved-reports'], queryFn: () => dashboardApi.listSavedReports() });
  useEffect(() => { if (dashboard.data) setDraftWidgets(dashboard.data.layout.widgets); }, [dashboard.data]);
  const invalidate = () => Promise.all([queryClient.invalidateQueries({ queryKey: ['dashboard'] }), queryClient.invalidateQueries({ queryKey: ['saved-reports'] })]);
  const saveLayout = useMutation({ mutationFn: () => dashboardApi.updateLayout(dashboard.data!.layout.id, { name: dashboard.data!.layout.name, isDefault: true, filters, widgets: draftWidgets }), onSuccess: async () => { await invalidate(); setEditing(false); } });
  const createReport = useMutation({ mutationFn: (type: DashboardWidgetKind) => dashboardApi.createSavedReport({ name: `${titles[type]} · ${filters.from}`, reportType: type, filters, isPinned: false }), onSuccess: invalidate });
  const updateReport = useMutation({ mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof dashboardApi.updateSavedReport>[1] }) => dashboardApi.updateSavedReport(id, patch), onSuccess: invalidate });
  const duplicateReport = useMutation({ mutationFn: dashboardApi.duplicateSavedReport, onSuccess: invalidate });
  const orderedReports = useMemo(() => !dashboard.data ? [] : dashboard.data.layout.widgets.filter((preference) => preference.visible).sort((a, b) => a.order - b.order).map((preference) => ({ preference, report: dashboard.data.reports.find((item) => item.type === preference.kind)! })), [dashboard.data]);
  const updateFilters = (patch: Partial<ReportFilters>) => { const next = { ...filters, ...patch }; setSearchParams({ from: next.from, to: next.to, comparison: next.comparison, ...(layoutId ? { layout: layoutId } : {}) }); };

  if (dashboard.isLoading) return <div role="status" aria-live="polite" className="space-y-6"><div className="h-12 w-52 animate-pulse rounded-xl bg-muted" /><div className="grid gap-6 lg:grid-cols-2"><div className="h-64 animate-pulse rounded-2xl bg-muted" /><div className="h-64 animate-pulse rounded-2xl bg-muted" /></div><span className="sr-only">Loading dashboard</span></div>;
  if (dashboard.isError || !dashboard.data) return <ContentPanel><div role="alert"><h1 className="text-xl font-semibold">Dashboard unavailable</h1><p className="mt-2 text-sm text-muted-foreground">{dashboard.error instanceof Error ? dashboard.error.message : 'The dashboard could not be loaded.'}</p><Button className="mt-5" onClick={() => dashboard.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Try again</Button></div></ContentPanel>;

  return <div className="space-y-8">
    <PageHeader title="Dashboard" description="Configurable financial insights derived from the posted ledger, with recent operational activity." actions={<><Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Print</Button><Button onClick={() => setEditing((value) => !value)}><Settings2 className="mr-2 h-4 w-4" />Configure</Button></>} />
    <ContentPanel className="print:hidden"><div className="grid gap-4 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end"><label className="grid gap-1 text-sm font-medium">From<input className="rounded-xl border border-input bg-background px-3 py-2" type="date" value={filters.from} max={filters.to} onChange={(event) => updateFilters({ from: event.target.value })} /></label><label className="grid gap-1 text-sm font-medium">To<input className="rounded-xl border border-input bg-background px-3 py-2" type="date" value={filters.to} min={filters.from} onChange={(event) => updateFilters({ to: event.target.value })} /></label><label className="grid gap-1 text-sm font-medium">Compare<select className="rounded-xl border border-input bg-background px-3 py-2" value={filters.comparison} onChange={(event) => updateFilters({ comparison: event.target.value as ReportFilters['comparison'] })}><option value="previous_period">Previous period</option><option value="previous_year">Previous year</option><option value="none">No comparison</option></select></label><Button variant="outline" onClick={() => updateFilters(initialRange())}><RefreshCw className="mr-2 h-4 w-4" />Year to date</Button></div></ContentPanel>
    {editing && <LayoutEditor widgets={draftWidgets} onChange={setDraftWidgets} onCancel={() => setEditing(false)} onSave={() => saveLayout.mutate()} saving={saveLayout.isPending} />}
    <div className="grid gap-6 lg:grid-cols-2">{orderedReports.map(({ report, preference }) => <ReportCard key={report.type} report={report} preference={preference} onSave={(type) => createReport.mutate(type)} />)}</div>
    {!orderedReports.length && <ContentPanel><div className="py-8 text-center"><h2 className="font-semibold">Your dashboard is empty</h2><p className="mt-1 text-sm text-muted-foreground">Turn on at least one widget in dashboard settings.</p><Button className="mt-4" onClick={() => setEditing(true)}><Plus className="mr-2 h-4 w-4" />Choose widgets</Button></div></ContentPanel>}
    <SavedReports reports={savedReports.data ?? []} onOpen={(report) => setSearchParams({ from: report.filters.from, to: report.filters.to, comparison: report.filters.comparison })} onChange={(report, patch) => updateReport.mutate({ id: report.id, patch })} onDuplicate={(id) => duplicateReport.mutate(id)} />
  </div>;
}
