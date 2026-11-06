import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import ExpenseEditScreen from './ExpenseEditScreen';
import { expenseService } from '@/services/expenseService';

const mockBack = jest.fn();
const mockNavigation = { goBack: mockBack };
const mockRoute = { params: { expenseId: 'expense-1' } };
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNavigation, useRoute: () => mockRoute }));
jest.mock('@/services/expenseService', () => ({ expenseService: { fetchExpenseById: jest.fn(), updateExpense: jest.fn() } }));
jest.mock('@/services/capabilitiesService', () => ({ getServerCapabilities: () => Promise.resolve({ ai: 'unavailable' }) }));
jest.mock('@/components/expense/CategoryPicker', () => ({ CategoryPicker: () => null }));
jest.mock('@/components/expense/AccountPicker', () => ({ AccountPicker: () => null }));
jest.mock('@/components/customers/CustomerPicker', () => ({ CustomerPicker: () => null }));
jest.mock('@/components/expense/ReceiptScanner', () => ({ ReceiptScanner: () => null }));

it('approves an expense without adding GST again to the already gross stored amount', async () => {
  jest.mocked(expenseService.fetchExpenseById).mockResolvedValue({ id: 'expense-1', description: 'Office supplies', amount: 230, taxAmount: 30, status: 'pending', expenseDate: '2026-11-06', currency: 'NZD' } as never);
  jest.mocked(expenseService.updateExpense).mockResolvedValue({} as never);
  const screen = render(<ExpenseEditScreen />);
  await screen.findByDisplayValue('200.00');
  fireEvent.press(screen.getByText('Approved', { exact: true }));
  fireEvent.press(screen.getByText('Update Expense'));
  await waitFor(() => expect(expenseService.updateExpense).toHaveBeenCalledWith('expense-1', expect.objectContaining({ amount: 230, taxAmount: 30, status: 'approved' })));
});
