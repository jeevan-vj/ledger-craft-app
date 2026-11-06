import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ImportPreview } from './ImportPreview';
import { transactionImportService } from '@/services/transactionImportService';
import { parseCSVTransactions } from '@/services/csvTransactionParser';
import type { BankAccount } from '@/types/bankTransaction';
vi.mock('@/services/transactionImportService', () => ({ transactionImportService: { importTransactions: vi.fn() } }));
const bank: BankAccount = { id: 'bank', accountName: 'Operating', accountNumber: '1', bankName: 'Bank', accountType: 'checking', currency: 'NZD', openingBalance: 0, currentBalance: 0, isActive: true };
it('preserves debit direction, ISO date and quoted descriptions when importing parsed rows', async () => {
 vi.mocked(transactionImportService.importTransactions).mockResolvedValue({ success: true, importedCount: 1, duplicatesSkipped: 0, errors: [], transactions: [] });
 render(<ImportPreview bankAccount={bank} parseResult={{ success: true, errors: [], transactions: [{ date: '2026-04-12', description: 'Software, yearly', amount: 20, type: 'debit' }] }} onImportConfirm={vi.fn()} onBack={vi.fn()} />);
 fireEvent.click(screen.getByRole('button', { name: 'Import 1 Transactions' }));
 await waitFor(() => expect(transactionImportService.importTransactions).toHaveBeenCalled());
 const [csv, config] = vi.mocked(transactionImportService.importTransactions).mock.calls[0];
 expect(config.fileType).toBe('csv');
 const parsed = await parseCSVTransactions(csv, config.csvMapping, config.dateFormat);
 expect(parsed.errors).toEqual([]);
 expect(parsed.transactions).toEqual([expect.objectContaining({ date: '2026-04-12', description: 'Software, yearly', amount: 20, type: 'debit' })]);
});
