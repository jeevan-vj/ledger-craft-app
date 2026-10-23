import {
  dashboardLayoutListResponseSchema,
  dashboardLayoutSchema,
  dashboardResponseSchema,
  savedReportDefinitionSchema,
  savedReportListResponseSchema,
  type CreateSavedReportRequest,
  type DashboardResponse,
  type ReportFilters,
  type SaveDashboardLayoutRequest,
  type UpdateSavedReportRequest,
} from '@ledgercraft/contracts';
import { readApiFailure } from '@/lib/api/readApiError';

export class DashboardApiError extends Error {
  constructor(message: string, readonly status: number, readonly requestId?: string) {
    super(message);
    this.name = 'DashboardApiError';
  }
}

async function request(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (response.status === 204) return undefined;
  if (!response.ok) {
    const failure = await readApiFailure(response);
    throw new DashboardApiError(failure.message, failure.status, failure.requestId);
  }
  return response.json();
}

function query(filters?: Partial<ReportFilters> & { layoutId?: string }) {
  const params = new URLSearchParams();
  if (filters?.from) params.set('from', filters.from);
  if (filters?.to) params.set('to', filters.to);
  if (filters?.comparison) params.set('comparison', filters.comparison);
  if (filters?.layoutId) params.set('layoutId', filters.layoutId);
  return params.size ? `?${params.toString()}` : '';
}

export const dashboardApi = {
  async getDashboard(filters?: Partial<ReportFilters> & { layoutId?: string }): Promise<DashboardResponse> {
    return dashboardResponseSchema.parse(await request(`/api/dashboard${query(filters)}`));
  },
  async listLayouts() {
    return dashboardLayoutListResponseSchema.parse(await request('/api/dashboard-layouts')).layouts;
  },
  async createLayout(input: SaveDashboardLayoutRequest) {
    return dashboardLayoutSchema.parse(await request('/api/dashboard-layouts', { method: 'POST', body: JSON.stringify(input) }));
  },
  async updateLayout(id: string, input: SaveDashboardLayoutRequest) {
    return dashboardLayoutSchema.parse(await request(`/api/dashboard-layouts/${id}`, { method: 'PUT', body: JSON.stringify(input) }));
  },
  async listSavedReports(includeArchived = false) {
    return savedReportListResponseSchema.parse(await request(`/api/saved-reports${includeArchived ? '?archived=true' : ''}`)).reports;
  },
  async createSavedReport(input: CreateSavedReportRequest) {
    return savedReportDefinitionSchema.parse(await request('/api/saved-reports', { method: 'POST', body: JSON.stringify(input) }));
  },
  async updateSavedReport(id: string, input: UpdateSavedReportRequest) {
    return savedReportDefinitionSchema.parse(await request(`/api/saved-reports/${id}`, { method: 'PATCH', body: JSON.stringify(input) }));
  },
  async duplicateSavedReport(id: string) {
    return savedReportDefinitionSchema.parse(await request(`/api/saved-reports/${id}/duplicate`, { method: 'POST' }));
  },
  async deleteSavedReport(id: string) {
    await request(`/api/saved-reports/${id}`, { method: 'DELETE' });
  },
};
