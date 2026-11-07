import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import IRDReportingPage from '../IRDReportingPage';

vi.mock('@/context/StableAuthContext', () => ({ useAuth: () => ({ me: { permissions: ['banking.write'] } }) }));
vi.mock('@/components/layout/PageHeader', () => ({ PageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));
const settings = { gstRegistrationStatus: 'registered', taxId: '49091850', gstRegisteredFrom: '2026-11-01', gstAccountingBasis: 'invoice', gstFilingFrequency: 'monthly', gstPeriodAnchor: 3, configured: true, reviewRequired: false, warnings: [] };
const period = { periodStart: '2026-11-01', periodEnd: '2026-11-30', dueDate: '2027-01-15', status: 'not_started', taxReturnId: null, netGst: null, irdReference: null };
let saved: Record<string, unknown>; let writes: Array<{ path: string; body: Record<string, unknown> }>;
beforeEach(() => {
  writes = [];
  vi.stubGlobal('fetch', vi.fn(async (path: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
    if (body) writes.push({ path, body });
    let value: unknown;
    if (path === '/api/tax/gst-periods') value = { settings, asOf: '2026-11-07', periods: [period], reviewRequired: false, warnings: [] };
    else if (path === '/api/tax-returns' && !body) value = { taxReturns: [] };
    else if (path.startsWith('/api/tax/gst-preparation')) value = { basis: 'invoice', from: period.periodStart, to: period.periodEnd, baseCurrency: 'NZD', totalSales: '1610.00', totalPurchases: '625.00', gstOnSales: '210.00', gstOnPurchases: '75.00', netGstPosition: '135.00', warnings: [] };
    else if (body) { saved = { ...body, id: '11111111-1111-4111-8111-111111111111', submittedAt: null, irdReference: null, createdAt: '2026-11-07', updatedAt: '2026-11-07' }; value = saved; }
    else value = saved;
    return new Response(JSON.stringify(value), { status: body ? 201 : 200 });
  }));
});
it('opens an explicit ordinary-company worksheet without calculating personal tax bands or posting a return', async () => {
  render(<MemoryRouter><IRDReportingPage /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Company tax worksheet' }));
  expect(await screen.findByRole('heading', { name: 'Company income tax worksheet' })).toBeInTheDocument();
  expect(screen.getByLabelText('I confirm this is an ordinary NZ company eligible for the 28% rate')).not.toBeChecked();
  expect(writes).toHaveLength(0);
});
it('retains the server-generated November due exception and exact figures in a saved preparation record', async () => {
  render(<MemoryRouter><IRDReportingPage /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Prepare 2026-11-01 to 2026-11-30' }));
  expect(screen.getByLabelText('GST due date (confirm in myIR)')).toHaveValue('2027-01-15');
  expect(screen.getByLabelText('Registered GST basis')).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Prepare GST worksheet' }));
  await screen.findByText('NZD 135.00');
  fireEvent.click(screen.getByLabelText('I have reviewed the worksheet and bank reconciliation'));
  fireEvent.click(screen.getByRole('button', { name: 'Save GST worksheet draft' }));
  await waitFor(() => expect(writes.find(write => write.path === '/api/tax-returns')?.body).toMatchObject({ periodStart: '2026-11-01', periodEnd: '2026-11-30', netGst: '135.00', returnData: { preparation: { basis: 'invoice', baseCurrency: 'NZD', dueDate: '2027-01-15' } } }));
  expect(await screen.findByRole('status')).toHaveTextContent('GST draft saved and reloaded');
});
