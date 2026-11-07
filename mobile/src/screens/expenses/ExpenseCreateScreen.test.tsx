import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { reportsApi } from '@/features/reports/api/reportsApi';
import React from 'react';
import { Text as MockReceiptText } from 'react-native';
import { act, fireEvent, render as testingRender, waitFor } from '@testing-library/react-native';
import ExpenseCreateScreen from './ExpenseCreateScreen';
import { expenseService } from '@/services/expenseService';

jest.mock('@/features/reports/api/reportsApi',()=>({reportsApi:{options:jest.fn()}}));
const render=(element:React.ReactElement)=>testingRender(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}>{element}</QueryClientProvider>);
afterEach(()=>jest.useRealTimers());
const mockBack = jest.fn();
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ goBack: mockBack }) }));
jest.mock('@/services/expenseService', () => ({ expenseService: { createExpense: jest.fn(), fetchExpenses: jest.fn() } }));
jest.mock('@/services/capabilitiesService', () => ({ getServerCapabilities: () => Promise.resolve({ ai: 'unavailable' }) }));
jest.mock('@/components/expense/CategoryPicker', () => ({ CategoryPicker: () => null }));
jest.mock('@/components/expense/AccountPicker', () => ({ AccountPicker: () => null }));
jest.mock('@/components/customers/CustomerPicker', () => ({ CustomerPicker: () => null }));
jest.mock('@/components/expense/ReceiptScanner', () => ({ ReceiptScanner: ({ visible, onScanComplete }: { visible: boolean; onScanComplete: (result: unknown, url: string) => void }) => { return visible ? <MockReceiptText onPress={() => onScanComplete({merchantName:'Supplier',date:'2026-10-01',total:'115.00',tax:'15.00',items:[],paymentMethod:'card'},'/api/objects?key=receipt')}>Use scanned receipt</MockReceiptText> : null; } }));

describe('mobile expense accounting', () => {
  it('defaults to the NZ business calendar day across UTC midnight when settings are unavailable',async()=>{
    jest.useFakeTimers({doNotFake:['setTimeout','setInterval','setImmediate','clearTimeout','clearInterval','clearImmediate','nextTick','queueMicrotask','performance']});jest.setSystemTime(new Date('2026-11-06T12:30:00Z'));
    const screen=render(<ExpenseCreateScreen/>);expect(screen.getByDisplayValue('2026-11-07')).toBeTruthy();
  });
  it('uses the configured company timezone',async()=>{
    jest.useFakeTimers({doNotFake:['setTimeout','setInterval','setImmediate','clearTimeout','clearInterval','clearImmediate','nextTick','queueMicrotask','performance']});jest.setSystemTime(new Date('2026-11-07T04:30:00Z'));
    jest.mocked(reportsApi.options).mockResolvedValue({today:'2026-11-06',timezone:'America/Los_Angeles'} as never);
    const screen=render(<ExpenseCreateScreen/>);await screen.findByDisplayValue('2026-11-06');
    fireEvent.changeText(screen.getByPlaceholderText('YYYY-MM-DD'),'2026-10-01');expect(screen.getByDisplayValue('2026-10-01')).toBeTruthy();
  });
  it('retains an explicitly entered source date when company date settings arrive later',async()=>{
    let finish: (value: Awaited<ReturnType<typeof reportsApi.options>>) => void = ()=>{};
    jest.mocked(reportsApi.options).mockReturnValue(new Promise(resolve=>{finish=resolve}));
    const screen=render(<ExpenseCreateScreen/>);fireEvent.changeText(screen.getByPlaceholderText('YYYY-MM-DD'),'2026-10-01');
    await act(async()=>{finish({today:'2026-11-06',timezone:'America/Los_Angeles'} as never);await new Promise(resolve=>setTimeout(resolve,10));});
    expect(screen.getByDisplayValue('2026-10-01')).toBeTruthy();
  });
  it('warns about a matching saved receipt and requires explicit duplicate override', async () => {
    jest.mocked(expenseService.fetchExpenses).mockResolvedValue([{vendorName:'Supplier',expenseDate:'2026-10-01',amount:115,amountText:'115.00'}] as never);
    const screen = render(<ExpenseCreateScreen />);
    fireEvent.press(screen.getByText('Attach receipt')); fireEvent.press(screen.getByText('Use scanned receipt'));
    fireEvent.changeText(screen.getByPlaceholderText('What was this for'), 'Receipt supplies');
    fireEvent.press(screen.getByText('Create Expense'));
    await waitFor(()=>expect(screen.getByText('Possible duplicate receipt. Review the existing expense before saving another.')).toBeTruthy());
    expect(expenseService.createExpense).not.toHaveBeenCalled();
  });
  it('reviews scanned gross and GST without adding GST a second time and retains exact editable source amounts', async () => {
    const screen = render(<ExpenseCreateScreen />);
    fireEvent.press(screen.getByText('Attach receipt'));
    fireEvent.press(screen.getByText('Use scanned receipt'));
    fireEvent.changeText(screen.getByPlaceholderText('What was this for'), 'Receipt supplies');
    expect(screen.getByLabelText('Reviewed receipt total').props.value).toBe('115.00');
    expect(screen.getByLabelText('Reviewed receipt GST').props.value).toBe('15.00');
    expect(screen.getByText('GST from reviewed receipt')).toBeTruthy();
    fireEvent.press(screen.getByText('Create Expense'));
    await waitFor(() => expect(expenseService.createExpense).toHaveBeenCalledWith(expect.objectContaining({amount:115,taxAmount:15,amountText:'115.00',taxAmountText:'15.00',receiptUrl:'/api/objects?key=receipt'})));
  });
  beforeEach(() => { jest.mocked(reportsApi.options).mockReset().mockRejectedValue(new Error('Unavailable'));  jest.mocked(expenseService.createExpense).mockReset().mockResolvedValue({} as never); jest.mocked(expenseService.fetchExpenses).mockReset().mockResolvedValue([]); });
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
