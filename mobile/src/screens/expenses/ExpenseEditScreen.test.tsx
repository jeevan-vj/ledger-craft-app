import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { reportsApi } from '@/features/reports/api/reportsApi';
import React from 'react';
import { fireEvent, render as testingRender, waitFor } from '@testing-library/react-native';
import ExpenseEditScreen from './ExpenseEditScreen';
import { expenseService } from '@/services/expenseService';

jest.mock('@/features/reports/api/reportsApi',()=>({reportsApi:{options:jest.fn()}}));
const render=(element:React.ReactElement)=>testingRender(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}>{element}</QueryClientProvider>);
afterEach(()=>jest.useRealTimers());
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

beforeEach(()=>{jest.mocked(reportsApi.options).mockReset().mockRejectedValue(new Error('Unavailable'));});

it('uses the NZ business day only for a missing legacy date and preserves stored dates',async()=>{
 jest.useFakeTimers({doNotFake:['setTimeout','setInterval','setImmediate','clearTimeout','clearInterval','clearImmediate','nextTick','queueMicrotask','performance']});jest.setSystemTime(new Date('2026-11-06T12:30:00Z'));
 jest.mocked(expenseService.fetchExpenseById).mockResolvedValue({id:'expense-1',description:'Undated legacy cost',amount:115,taxAmount:15,status:'pending',expenseDate:'',currency:'NZD'} as never);
 const screen=render(<ExpenseEditScreen/>);await screen.findByDisplayValue('2026-11-07');
});

it('approves an expense without adding GST again to the already gross stored amount', async () => {
  jest.mocked(expenseService.fetchExpenseById).mockResolvedValue({ id: 'expense-1', description: 'Office supplies', amount: 230, taxAmount: 30, status: 'pending', expenseDate: '2026-11-06', currency: 'NZD' } as never);
  jest.mocked(expenseService.updateExpense).mockResolvedValue({} as never);
  const screen = render(<ExpenseEditScreen />);
  await screen.findByDisplayValue('200.00');
  fireEvent.press(screen.getByText('Approved', { exact: true }));
  fireEvent.press(screen.getByText('Update Expense'));
  await waitFor(() => expect(expenseService.updateExpense).toHaveBeenCalledWith('expense-1', expect.objectContaining({ amount: 230, taxAmount: 30, status: 'approved' })));
});
