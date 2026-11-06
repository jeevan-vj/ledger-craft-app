import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OpeningBalancesPanel } from './OpeningBalancesPanel';
import { LedgerAuditPanel } from './LedgerAuditPanel';

const accounts = [{ id: 'cash', name: 'Business cash', currency: 'NZD', isActive: true }, { id: 'capital', name: 'Owner capital', currency: 'NZD', isActive: true }, { id: 'foreign', name: 'USD bank', currency: 'USD', isActive: true }];
const finding = { key: 'expense:old', fingerprint: 'a'.repeat(64), type: 'expense_gst', sourceId: 'expense-1', sourceJournalId: 'journal-1', sourceDate: '2026-04-01', description: 'Partial expense GST was overstated', requiresReceiptConfirmation: true, actual: { inputGst: '30.00' }, expected: { inputGst: '15.00' }, correctionLines: [{ accountId: 'cash', debit: '15.00', credit: '0.00' }, { accountId: 'capital', debit: '0.00', credit: '15.00' }] };
const calls: Array<{ path: string; body?: Record<string, unknown> }> = [];
let empty = false;
beforeEach(() => { calls.length = 0; empty = false; vi.stubGlobal('fetch', vi.fn(async (path: string, init?: RequestInit) => {
  const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
  calls.push({ path, body });
  if (path.endsWith('/opening-balances')) return new Response(JSON.stringify({ journalEntryId: 'opening-1', date: body?.date, reference: body?.reference, total: '5000.00', replayed: false }));
  if (path.endsWith('/apply')) return new Response(JSON.stringify({ corrections: [{ key: finding.key, journalEntryId: 'correction-1', replayed: false }] }));
  return new Response(JSON.stringify({ findings: empty ? [] : [finding], warnings: [] }));
})); });
describe('ledger recovery and opening balances', () => {
  it('requires balanced reviewed lines and posts exact opening capital once', async () => {
    render(<OpeningBalancesPanel accounts={accounts} />);
    expect(screen.queryByRole('option', { name: 'USD bank' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Opening account 1')).toHaveAccessibleName('Opening account 1');
    fireEvent.change(screen.getByLabelText('Opening reference'), { target: { value: 'Opening records 2026' } });
    fireEvent.change(screen.getByLabelText('Opening account 1'), { target: { value: 'cash' } });
    fireEvent.change(screen.getByLabelText('Opening debit 1'), { target: { value: '5000.00' } });
    fireEvent.change(screen.getByLabelText('Opening account 2'), { target: { value: 'capital' } });
    expect(screen.getByRole('button', { name: 'Post opening balances' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Opening credit 2'), { target: { value: '5000.00' } });
    fireEvent.click(screen.getByLabelText('I have checked these opening balances against the previous accounts'));
    fireEvent.click(screen.getByRole('button', { name: 'Post opening balances' }));
    expect(await screen.findByText('Opening journal posted: opening-1')).toBeInTheDocument();
    expect(calls[0].body).toMatchObject({ reviewed: true, lines: [{ accountId: 'cash', debit: '5000.00', credit: '0.00' }, { accountId: 'capital', debit: '0.00', credit: '5000.00' }] });
    expect(screen.getByRole('button', { name: 'Post opening balances' })).toBeDisabled();
  });
  it('shows actual versus expected and requires original receipt confirmation before correction', async () => {
    render(<LedgerAuditPanel accounts={accounts} />);
    fireEvent.click(screen.getByRole('button', { name: 'Audit historical ledger' }));
    expect(await screen.findByText('Partial expense GST was overstated')).toBeInTheDocument();
    expect(screen.getByText('inputGst: 30.00')).toBeInTheDocument();
    expect(screen.getByText('inputGst: 15.00')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Select correction for Partial expense GST was overstated'));
    fireEvent.change(screen.getByLabelText('Correction reason'), { target: { value: 'Receipt checked by accountant' } });
    fireEvent.click(screen.getByLabelText('I have reviewed the selected corrective journal lines'));
    expect(screen.getByRole('button', { name: 'Post selected corrections' })).toBeDisabled();
    fireEvent.click(screen.getByLabelText('I confirm the original receipt shows the stored raw GST for Partial expense GST was overstated'));
    fireEvent.click(screen.getByRole('button', { name: 'Post selected corrections' }));
    expect(await screen.findByText('Corrective journals posted: correction-1')).toBeInTheDocument();
    expect(calls.find((call) => call.path.endsWith('/apply'))?.body).toMatchObject({ reviewed: true, findings: [{ key: finding.key, fingerprint: finding.fingerprint, receiptGstConfirmed: true }] });
  });
  it('does not call a clean audit a complete certification', async () => {
    empty = true; render(<LedgerAuditPanel accounts={accounts} />);
    fireEvent.click(screen.getByRole('button', { name: 'Audit historical ledger' }));
    expect(await screen.findByText('No supported historical defects found')).toBeInTheDocument();
    expect(screen.getByText(/This audit checks known posting patterns/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Post selected corrections' })).not.toBeInTheDocument();
  });
});
