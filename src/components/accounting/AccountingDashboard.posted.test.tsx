import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { AccountingDashboard } from './AccountingDashboard';
import type { FinancialSummary } from '@/types/payment';
vi.mock('recharts', () => ({
  BarChart: () => null, Bar: () => null, LineChart: () => null, Line: () => null,
  PieChart: () => null, Pie: () => null, Cell: () => null, XAxis: () => null,
  YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null, ResponsiveContainer: () => null, Legend: () => null,
}));
const summary: FinancialSummary = {
 totalRevenue: 1400, totalExpenses: 550, netIncome: 850, totalReceivables: 230, totalPayables: 276,
 cashPosition: 6031, gstLiability: 135, gstCollected: 210, gstPaid: 75,
 outstandingInvoices: 1, outstandingBills: 1,
 period: { startDate: '2026-04-01', endDate: '2026-04-30' },
 receivablesAging: { total: '230', current: '230', days1To30: '0', days31To60: '0', days61To90: '0', over90: '0', items: [] },
 payablesAging: { total: '276', current: '276', days1To30: '0', days31To60: '0', days61To90: '0', over90: '0', items: [] },
};
it('shows actual posted GST components and aging without invented trends or filing dates', () => {
 render(<MemoryRouter><AccountingDashboard financialSummary={summary} accountBalances={[]} onRefresh={vi.fn()} onExportReport={vi.fn()} /></MemoryRouter>);
 expect(screen.getByText('GST Collected').parentElement).toHaveTextContent('$210');
 expect(screen.getByText('GST Paid').parentElement).toHaveTextContent('$75');
 expect(screen.queryByText('$28,500')).not.toBeInTheDocument();
 expect(screen.queryByText(/12.5% vs last period/)).not.toBeInTheDocument();
 expect(screen.queryByText(/28 February 2024/)).not.toBeInTheDocument();
 expect(screen.getByText('1 bills')).toBeInTheDocument();
 expect(screen.getByText(/confirm.*myIR/i)).toBeInTheDocument();
});
