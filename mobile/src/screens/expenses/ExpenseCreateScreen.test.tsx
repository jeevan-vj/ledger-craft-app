import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import ExpenseCreateScreen from './ExpenseCreateScreen';
import { expenseService } from '@/services/expenseService';

const mockBack = jest.fn();
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ goBack: mockBack }) }));
jest.mock('@/services/expenseService', () => ({ expenseService: { createExpense: jest.fn() } }));
jest.mock('@/services/capabilitiesService', () => ({ getServerCapabilities: () => Promise.resolve({ ai: 'unavailable' }) }));
jest.mock('@/components/expense/CategoryPicker', () => ({ CategoryPicker: () => null }));
jest.mock('@/components/expense/AccountPicker', () => ({ AccountPicker: () => null }));
jest.mock('@/components/customers/CustomerPicker', () => ({ CustomerPicker: () => null }));
jest.mock('@/components/expense/ReceiptScanner', () => ({ ReceiptScanner: () => null }));

describe('mobile expense accounting', () => {
  beforeEach(() => { jest.mocked(expenseService.createExpense).mockReset().mockResolvedValue({} as never); });
  it('saves the displayed gross payment and input GST rather than treating the net cost as cash paid', async () => {
    const screen = render(<ExpenseCreateScreen />);
    fireEvent.changeText(screen.getByLabelText('Expense amount'), '200');
    fireEvent.changeText(screen.getByPlaceholderText('What was this for'), 'Office supplies');
    fireEvent(screen.getAllByRole('switch')[0], 'valueChange', true);
    expect(screen.getByText('$230.00')).toBeTruthy();
    fireEvent.press(screen.getByText('Create Expense'));
    await waitFor(() => expect(expenseService.createExpense).toHaveBeenCalledWith(expect.objectContaining({ amount: 230, taxAmount: 30 })));
  });
});
