import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import JournalEntriesPage from '../JournalEntriesPage';
vi.mock('@/context/StableAuthContext', () => ({ useAuth: () => ({ user: { id: 'owner' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/components/layout/PageHeader', () => ({ PageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock('@/services/supabaseDataService', () => ({ supabaseDataService: {
  getAccounts: vi.fn(async () => []),
  getJournalEntries: vi.fn(async () => [{ id: 'journal', entryNumber: 'JE-001', entryDate: '2026-10-10', description: 'Received bill', referenceNumber: null, debitAccountId: 'expense', debitAccountName: 'Contracting', debitAmount: 1000, creditAccountId: 'ap', creditAccountName: 'Accounts Payable', creditAmount: 1150, debitTotal: '1150.00', creditTotal: '1150.00', status: 'posted', notes: null, createdAt: '2026-10-10T12:00:00Z', updatedAt: '2026-10-10T12:00:00Z', lines: [
    { id: 'cost', accountId: 'expense', accountName: 'Contracting', debitAmount: '1000.00', creditAmount: '0.00', description: 'Work', lineOrder: 1 },
    { id: 'gst', accountId: 'gst', accountName: 'GST paid', debitAmount: '150.00', creditAmount: '0.00', description: 'GST', lineOrder: 2 },
    { id: 'ap', accountId: 'ap', accountName: 'Accounts Payable', debitAmount: '0.00', creditAmount: '1150.00', description: 'Bill', lineOrder: 3 },
  ] }]),
} }));
it('shows compound GST lines and the balanced server totals instead of a partial two-account journal', async () => {
  render(<JournalEntriesPage />);
  expect(await screen.findByText('GST paid')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'View journal JE-001' }));
  const dialog = screen.getByRole('dialog');
  const posting = within(dialog).getByRole('table', { name: 'Journal posting lines' });
  expect(within(posting).getByText('GST paid')).toBeInTheDocument();
  expect(within(posting).getAllByText('$1150.00').length).toBeGreaterThanOrEqual(2);
  expect(within(posting).getByText('$150.00')).toBeInTheDocument();
  expect(within(posting).getByText('Total debits')).toBeInTheDocument();
  expect(within(posting).getByText('Total credits')).toBeInTheDocument();
});
it('exports actual CSV with every GST posting line instead of only reporting success', async () => {
  const createObjectURL = vi.fn((_blob: Blob) => 'blob:journal-export');
  const originalCreate = URL.createObjectURL; const originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = createObjectURL; URL.revokeObjectURL = vi.fn();
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  try {
    render(<JournalEntriesPage />);
    await screen.findByText('Received bill');
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    await vi.waitFor(() => expect(createObjectURL).toHaveBeenCalled());
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    const csv = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsText(blob); });
    expect(csv).toContain('GST paid'); expect(csv).toContain('150.00'); expect(csv).toContain('1150.00');
  } finally { URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; click.mockRestore(); }
});
