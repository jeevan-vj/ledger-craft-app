import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GstWorkspacePanel } from './GstWorkspacePanel';
import { gstWorkspaceApi } from '@/features/reports/api/gstWorkspaceApi';
import { shareGstReturn } from '@/features/reports/model/gstReturnDocument';
jest.mock('@/features/reports/api/gstWorkspaceApi', () => ({ gstWorkspaceApi: { periods: jest.fn(), saveSettings: jest.fn(), getReturn: jest.fn(), fileReturn: jest.fn(), reopen: jest.fn() } }));
jest.mock('@/features/reports/model/gstReturnDocument', () => ({ shareGstReturn: jest.fn() }));
jest.mock('./GstPreparationPanel', () => ({ GstPreparationPanel: () => null }));
function renderWorkspace() { const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } }); const view = render(<QueryClientProvider client={client}><GstWorkspacePanel /></QueryClientProvider>); return { ...view, client, redraw: () => view.rerender(<QueryClientProvider client={client}><GstWorkspacePanel /></QueryClientProvider>) }; }
const mockPermissions = ['settings.write', 'banking.write'];
jest.mock('@/store', () => ({ useStore: (select: (s: object) => unknown) => select({ permissions: mockPermissions }) }));
const settings = { gstRegistrationStatus: 'registered', taxId: '49091850', gstRegisteredFrom: '2026-04-01', gstAccountingBasis: 'payments', gstFilingFrequency: 'two_monthly', gstPeriodAnchor: 3, configured: true, reviewRequired: false, warnings: [] };
const period = { periodStart: '2026-04-01', periodEnd: '2026-05-31', dueDate: '2026-06-28', status: 'draft', taxReturnId: 'return-1', netGst: '141.00', irdReference: null };
const saved = { id: 'return-1', returnType: 'GST', status: 'draft', periodStart: period.periodStart, periodEnd: period.periodEnd, totalSales: '1380.00', totalPurchases: '349.00', gstOnSales: '180.00', gstOnPurchases: '39.00', netGst: '141.00', irdReference: null, returnData: { preparation: { basis: 'payments' } } };
beforeEach(() => { jest.clearAllMocks(); mockPermissions.splice(0, mockPermissions.length, 'settings.write', 'banking.write'); jest.mocked(gstWorkspaceApi.periods).mockResolvedValue({ settings, asOf: '2026-06-01', periods: [period], reviewRequired: false, warnings: [] } as never); jest.mocked(gstWorkspaceApi.getReturn).mockResolvedValue(saved as never); jest.mocked(gstWorkspaceApi.fileReturn).mockResolvedValue({ ...saved, status: 'submitted', irdReference: 'MYIR-141' } as never); });
it('shows server periods, due date and persisted basis without inventing defaults', async () => { const s = renderWorkspace(); expect(await s.findByText('Registered basis: Payments')).toBeTruthy(); expect(s.getByText(/2026-04-01.*2026-05-31/)).toBeTruthy(); expect(s.getByText(/Due 2026-06-28/)).toBeTruthy(); expect(s.getByText(/Draft.*\$141.00/)).toBeTruthy(); });
it('records external filing only after review and myIR reference, then shares saved figures', async () => {
 const s = renderWorkspace(); await s.findByText('Registered basis: Payments'); fireEvent.press(s.getByText('View saved return')); expect(await s.findByText('Saved net GST: $141.00')).toBeTruthy();
 fireEvent.press(s.getByText('Record external filing')); expect(s.getByText('Enter the confirmation reference from your completed myIR filing.')).toBeTruthy(); expect(gstWorkspaceApi.fileReturn).not.toHaveBeenCalled();
 fireEvent.changeText(s.getByLabelText('myIR confirmation reference'), 'MYIR-141'); fireEvent(s.getByLabelText('Confirm this return was filed externally in myIR'), 'valueChange', true); fireEvent.press(s.getByText('Record external filing')); expect(await s.findByText('Filed externally · MYIR-141')).toBeTruthy(); expect(gstWorkspaceApi.fileReturn).toHaveBeenCalledWith('return-1', 'MYIR-141');
 fireEvent.press(s.getByText('Share GST preparation PDF')); await waitFor(() => expect(shareGstReturn).toHaveBeenCalledWith(expect.objectContaining({ netGst: '141.00', irdReference: 'MYIR-141' })));
});
it('shows missing configuration and retryable failure rather than a false empty success', async () => { jest.mocked(gstWorkspaceApi.periods).mockRejectedValueOnce(new Error('Check your connection and try again.')); const s = renderWorkspace(); await s.findByText('Check your connection and try again.'); jest.mocked(gstWorkspaceApi.periods).mockResolvedValue({ settings: { ...settings, configured: false, gstAccountingBasis: null }, asOf: '2026-06-01', periods: [], reviewRequired: true, warnings: ['Complete GST settings before preparing a return.'] } as never); fireEvent.press(s.getByText('Retry GST workspace')); expect(await s.findByText('Complete GST settings before preparing a return.')).toBeTruthy(); expect(s.queryByText('No GST periods due')).toBeNull(); });
it('asks an owner for a reason before reopening a filed return', async () => {
 mockPermissions.splice(0, mockPermissions.length, 'settings.write', 'banking.write', 'organisations.update');
 jest.mocked(gstWorkspaceApi.getReturn).mockResolvedValue({ ...saved, status: 'submitted', irdReference: 'MYIR-141' } as never);
 jest.mocked(gstWorkspaceApi.reopen).mockResolvedValue({ ...saved, status: 'submitted', irdReference: 'MYIR-141', supersededAt: '2026-11-11T00:00:00.000Z', reopenReason: 'Correct October' } as never);
 const s = renderWorkspace(); await s.findByText('Registered basis: Payments'); fireEvent.press(s.getByText('View saved return'));
 fireEvent.press(await s.findByText('Reopen filed period')); expect(s.getByText('Enter a reason for reopening this filed period.')).toBeTruthy();
 fireEvent.changeText(s.getByLabelText('Reason for reopening'), 'Correct October'); fireEvent.press(s.getByText('Reopen filed period'));
 expect(await s.findByText(/Filed snapshot superseded/)).toBeTruthy();
 expect(gstWorkspaceApi.reopen).toHaveBeenCalledWith('return-1', 'Correct October');
});
it('hides settings and filing mutations for read-only users', async () => { mockPermissions.splice(0, mockPermissions.length, 'reports.read'); const s = renderWorkspace(); await s.findByText('Registered basis: Payments'); expect(s.queryByText('Edit GST settings')).toBeNull(); fireEvent.press(s.getByText('View saved return')); await s.findByText('Saved net GST: $141.00'); expect(s.queryByText('Record external filing')).toBeNull(); });

it('clears prior-company GST periods when the authenticated query cache is cleared', async () => { const s = renderWorkspace(); await s.findByText('Registered basis: Payments'); jest.mocked(gstWorkspaceApi.periods).mockResolvedValue({ settings: { ...settings, gstAccountingBasis: 'invoice' }, asOf: '2026-06-01', periods: [], reviewRequired: false, warnings: [] } as never); act(() => s.client.clear()); s.redraw(); expect(await s.findByText('Registered basis: Invoice')).toBeTruthy(); expect(s.queryByText(/2026-04-01.*2026-05-31/)).toBeNull(); });
