import type { DashboardResponse, ReportFilters, SavedReportDefinitionDto } from '@ledgercraft/contracts';
import { apiRequest } from '@/features/auth/api/http';

function query(filters?: ReportFilters) {
  if (!filters) return '';
  const params = new URLSearchParams({ from: filters.from, to: filters.to, comparison: filters.comparison });
  return `?${params.toString()}`;
}

export const dashboardApi = {
  getDashboard(filters?: ReportFilters) {
    return apiRequest<DashboardResponse>(`/api/dashboard${query(filters)}`);
  },
  async listSavedReports(): Promise<SavedReportDefinitionDto[]> {
    return (await apiRequest<{ reports: SavedReportDefinitionDto[] }>('/api/saved-reports')).reports;
  },
};
