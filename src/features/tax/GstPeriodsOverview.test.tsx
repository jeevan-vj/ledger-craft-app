import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { GstPeriodsOverview } from './GstPeriodsOverview';
const settings = { configured: true, reviewRequired: false, gstAccountingBasis: 'hybrid', gstFilingFrequency: 'two_monthly' };
const period = { periodStart: '2026-11-01', periodEnd: '2026-11-30', dueDate: '2027-01-15', status: 'overdue', taxReturnId: null, netGst: null, irdReference: null };
it('renders server periods and IRD due exceptions without making a browser quarterly calendar', () => {
  const prepare = vi.fn();
  render(<MemoryRouter><GstPeriodsOverview data={{ settings, asOf: '2027-01-16', periods: [period, { ...period, periodStart: '2026-03-01', periodEnd: '2026-03-31', dueDate: '2026-05-07', status: 'filed', taxReturnId: 'saved', netGst: '90.00', irdReference: 'MYIR-001' }], reviewRequired: false, warnings: [] } as never} onPrepare={prepare} onView={vi.fn()} /></MemoryRouter>);
  expect(screen.getByText('2027-01-15')).toBeInTheDocument();
  expect(screen.getByText('2026-05-07')).toBeInTheDocument();
  expect(screen.getByText('Overdue')).toBeInTheDocument();
  expect(screen.getByText('MYIR-001')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Prepare 2026-11-01 to 2026-11-30' }));
  expect(prepare).toHaveBeenCalledWith(period);
});
it('shows missing registered choices as review required, with no fabricated periods', () => {
  render(<MemoryRouter><GstPeriodsOverview data={{ settings: { configured: false }, periods: [], reviewRequired: true, warnings: ['Confirm your registration date and basis.'] } as never} onPrepare={vi.fn()} onView={vi.fn()} /></MemoryRouter>);
  expect(screen.getByRole('alert')).toHaveTextContent('Confirm your registration date and basis.');
  expect(screen.getByRole('link', { name: 'Confirm registered GST settings' })).toHaveAttribute('href', '/tax-config');
  expect(screen.queryByRole('button', { name: /^Prepare / })).not.toBeInTheDocument();
});
