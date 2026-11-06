import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import AccountingDashboardPage from '../AccountingDashboardPage';
import { accountingService } from '@/services/accountingService';
vi.mock('@/services/accountingService', () => ({ accountingService: { getFinancialSummary: vi.fn(), getAccountBalances: vi.fn(async () => []), getRevenueExpenseData: vi.fn(async () => []), getCashFlowData: vi.fn(async () => []), getExpenseBreakdown: vi.fn(async () => []) } }));
vi.mock('@/components/accounting/AccountingDashboard', () => ({ AccountingDashboard: ({ onExportReport }: { onExportReport: (type: string) => void }) => <button onClick={() => onExportReport('dashboard')}>Export report</button> }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
function Location() { const location = useLocation(); return <div data-testid="location">{location.pathname}{location.search}</div>; }
const mount = () => render(<MemoryRouter initialEntries={['/accounting?from=2026-04-01&to=2026-04-30']}><AccountingDashboardPage /><Location /></MemoryRouter>);
beforeEach(() => { vi.clearAllMocks(); vi.mocked(accountingService.getFinancialSummary).mockResolvedValue({ totalRevenue: 1400, totalExpenses: 550, netIncome: 850, totalReceivables: 230, totalPayables: 276, cashPosition: 6031, gstLiability: 135, period: { startDate: '2026-04-01', endDate: '2026-04-30' } }); });
it('shows a report failure and retry instead of an endless loading skeleton', async () => {
 vi.mocked(accountingService.getFinancialSummary).mockRejectedValue(new Error('Ledger unavailable'));
 mount(); expect(await screen.findByRole('alert')).toHaveTextContent('Ledger unavailable');
 expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
});
it('opens the real report export rather than simulating a successful download', async () => {
 mount(); fireEvent.click(await screen.findByRole('button', { name: 'Export report' }));
 await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/financial-reports?from=2026-04-01&to=2026-04-30'));
});
