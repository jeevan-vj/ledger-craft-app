import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { AdjustmentDialog } from './AdjustmentDialog';
import { reconciliationService } from '@/services/reconciliationService';
vi.mock('@/services/reconciliationService', () => ({ reconciliationService: { createAdjustment: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));
vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (value: string) => void; children: React.ReactNode }) => <select aria-label="Adjustment Type" value={value} onChange={e => onValueChange(e.target.value)}>{children}</select>,
  SelectTrigger: () => null, SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => <option value={value}>{children}</option>,
}));
beforeEach(() => { vi.clearAllMocks(); vi.mocked(reconciliationService.createAdjustment).mockResolvedValue({} as never); });
function open() { render(<AdjustmentDialog open onOpenChange={vi.fn()} sessionId="session" onAdjustmentCreated={vi.fn()} />); }
it('offers statement-side differences and explains that fees and errors in books need actual postings', () => {
  open();
  expect(screen.queryByRole('option', { name: 'Bank Fee' })).not.toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'Interest Earned' })).not.toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'Book Error' })).not.toBeInTheDocument();
  expect(screen.getByText(/Record bank fees, interest, returned payments and book corrections/i)).toBeInTheDocument();
});
it('sends a reviewed signed bank error as exact decimal text on the bank side', async () => {
  open();
  fireEvent.change(screen.getByRole('combobox', { name: 'Adjustment Type' }), { target: { value: 'bank_error' } });
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Bank overstated receipt' } });
  fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '-0.03' } });
  fireEvent.submit(screen.getByRole('button', { name: 'Add Adjustment' }).closest('form')!);
  await waitFor(() => expect(reconciliationService.createAdjustment).toHaveBeenCalledWith('session', expect.objectContaining({ amount: '-0.03', affectsBank: true, affectsBook: false, adjustmentType: 'bank_error' })));
});
it('does not accept a negative outstanding payment', async () => {
  open();
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Outstanding cheque' } });
  fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '-0.03' } });
  fireEvent.submit(screen.getByRole('button', { name: 'Add Adjustment' }).closest('form')!);
  await screen.findByText(/positive amount/i);
  expect(reconciliationService.createAdjustment).not.toHaveBeenCalled();
});
