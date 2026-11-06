import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import AccountingToolsScreen from './AccountingToolsScreen';
import { pendingMutation } from '@/features/accounting/pendingMutation';
import { accountingApi } from '@/features/accounting/accountingApi';
jest.mock('@/features/accounting/accountingApi', () => ({ accountingApi: { accounts: jest.fn(), scope: jest.fn(), open: jest.fn(), createJournal: jest.fn(), postJournal: jest.fn(), audit: jest.fn(), apply: jest.fn() } }));
jest.mock('@/hooks/useTabScreenInsets', () => ({ useTabScreenInsets: () => ({ bottomPadding: 40 }) }));
const accounts = [{ id: 'cash', name: 'Cash', currency: 'NZD', isActive: true, accountClass: 'asset' }, { id: 'capital', name: 'Owner capital', currency: 'NZD', isActive: true, accountClass: 'equity' }];
beforeEach(() => { jest.clearAllMocks(); jest.mocked(accountingApi.scope).mockResolvedValue({ownerId:'owner',organisationId:'company'}); jest.mocked(accountingApi.accounts).mockResolvedValue(accounts as never); jest.mocked(accountingApi.open).mockResolvedValue({ total: '5000.00', journalEntryId: 'opening-1' } as never); jest.mocked(accountingApi.audit).mockResolvedValue({ findings: [], warnings: [] }); });
it('posts reviewed opening capital as equal 5000 cash debit and equity credit without entering income or GST', async () => {
  const screen = render(<AccountingToolsScreen />);
  fireEvent.press(await screen.findByText('Choose debit account'));
  fireEvent.press(screen.getByText('Cash'));
  fireEvent.press(screen.getByText('Choose credit account'));
  fireEvent.press(screen.getByText('Owner capital'));
  fireEvent.changeText(screen.getByLabelText('Journal amount'), '5000.00');
  fireEvent.changeText(screen.getByLabelText('Journal reference'), 'Opening capital 2026');
  fireEvent(screen.getByLabelText('Confirm opening balances reviewed'), 'valueChange', true);
  fireEvent.press(screen.getByText('Post opening balances'));
  expect(await screen.findByText('Opening balances posted: $5,000.00')).toBeTruthy();
  expect(accountingApi.open).toHaveBeenCalledWith(expect.objectContaining({ reviewed: true, reference: 'Opening capital 2026', lines: [{ accountId: 'cash', debit: '5000.00', credit: '0.00' }, { accountId: 'capital', debit: '0.00', credit: '5000.00' }] }));
});
it('shows account errors and can retry before allowing a reviewed journal', async () => {
  jest.mocked(accountingApi.accounts).mockRejectedValueOnce(new Error('Accounts unavailable'));
  const screen = render(<AccountingToolsScreen />);
  expect(await screen.findByText('Accounts unavailable')).toBeTruthy();
  fireEvent.press(screen.getByText('Retry accounts'));
  expect(await screen.findByText('Choose debit account')).toBeTruthy();
  fireEvent.press(screen.getByText('Post opening balances'));
  expect(accountingApi.open).not.toHaveBeenCalled();
});
it('supports a complete multi-account opening with cash5000 plus equipment2000 and capital7000', async () => {
 jest.mocked(accountingApi.accounts).mockResolvedValue([...accounts, { id: 'equipment', name: 'Equipment', currency: 'NZD', isActive: true, accountClass: 'asset' }] as never);
 const screen = render(<AccountingToolsScreen />);
 fireEvent.press(await screen.findByText('Choose debit account')); fireEvent.press(screen.getByText('Cash'));
 fireEvent.press(screen.getByText('Choose credit account')); fireEvent.press(screen.getByText('Owner capital'));
 fireEvent.changeText(screen.getByLabelText('Journal amount'), '5000.00');
 fireEvent.changeText(screen.getByLabelText('Opening credit amount'), '7000.00');
 fireEvent.changeText(screen.getByLabelText('Journal reference'), 'Full opening worksheet');
 fireEvent.press(screen.getByText('Add opening line'));
 fireEvent.press(screen.getByText('Choose opening account 3')); fireEvent.press(screen.getByText('Equipment'));
 fireEvent.changeText(screen.getByLabelText('Opening debit 3'), '2000.00');
 fireEvent(screen.getByLabelText('Confirm opening balances reviewed'), 'valueChange', true);
 fireEvent.press(screen.getByText('Post opening balances'));
 await screen.findByText('Opening balances posted: $5,000.00');
 expect(accountingApi.open).toHaveBeenCalledWith(expect.objectContaining({ lines: [{ accountId: 'cash', debit: '5000.00', credit: '0.00' }, { accountId: 'capital', debit: '0.00', credit: '7000.00' }, { accountId: 'equipment', debit: '2000.00', credit: '0.00' }] }));
});
it('retries posting the same manual journal without creating a second draft after a failed post', async () => {
 jest.mocked(accountingApi.createJournal).mockResolvedValue({id:'draft-journal'} as never);
 jest.mocked(accountingApi.postJournal).mockRejectedValueOnce(new Error('Posting interrupted')).mockResolvedValue({id:'draft-journal',status:'posted'} as never);
 const cash='11111111-1111-4111-8111-111111111111',capital='22222222-2222-4222-8222-222222222222';
 jest.mocked(accountingApi.accounts).mockResolvedValue([{...accounts[0],id:cash},{...accounts[1],id:capital}] as never);
 const screen=render(<AccountingToolsScreen/>);await screen.findByText('Choose debit account');fireEvent.press(screen.getByText('Manual journal'));
 fireEvent.press(screen.getByText('Choose debit account'));fireEvent.press(screen.getByText('Cash'));fireEvent.press(screen.getByText('Choose credit account'));fireEvent.press(screen.getByText('Owner capital'));
 fireEvent.changeText(screen.getByLabelText('Journal amount'),'5000.00');fireEvent.changeText(screen.getByLabelText('Journal reference'),'Owner contribution 001');fireEvent.changeText(screen.getByLabelText('Journal description'),'Reviewed owner capital contribution');
 fireEvent(screen.getByLabelText('Confirm opening balances reviewed'),'valueChange',true);fireEvent.press(screen.getByText('Post manual journal'));await screen.findByText('Posting interrupted');fireEvent.press(screen.getByText('Retry journal posting'));
 expect(await screen.findByText('Journal posted: $5,000.00')).toBeTruthy();expect(accountingApi.createJournal).toHaveBeenCalledTimes(1);expect(accountingApi.postJournal).toHaveBeenCalledTimes(2);expect(accountingApi.createJournal).toHaveBeenCalledWith(expect.objectContaining({debitAccountId:cash,creditAccountId:capital,amount:'5000.00'}),expect.any(String));
});

it('restores a saved manual journal after reopening and retries the exact persisted key/body',async()=>{
 const cash='11111111-1111-4111-8111-111111111111',capital='22222222-2222-4222-8222-222222222222';
 const input={entryDate:'2026-11-06',description:'Reviewed owner capital',referenceNumber:'CAP-001',debitAccountId:cash,creditAccountId:capital,amount:'5000.00'};
 const restore=jest.spyOn(pendingMutation,'load').mockResolvedValue({key:'saved-manual-key',input,uncertain:true} as never);
 jest.mocked(accountingApi.accounts).mockResolvedValue([{...accounts[0],id:cash},{...accounts[1],id:capital}] as never);jest.mocked(accountingApi.createJournal).mockResolvedValue({id:'existing-draft'} as never);jest.mocked(accountingApi.postJournal).mockResolvedValue({id:'existing-draft',status:'posted'} as never);
 const screen=render(<AccountingToolsScreen/>);await screen.findByText('Resume saved manual journal');expect(screen.getByLabelText('Journal amount').props.value).toBe('5000.00');
 fireEvent(screen.getByLabelText('Confirm opening balances reviewed'),'valueChange',true);fireEvent.press(screen.getByText('Resume saved manual journal'));
 await screen.findByText('Journal posted: $5,000.00');expect(accountingApi.createJournal).toHaveBeenCalledWith(input,'saved-manual-key');restore.mockRestore();
});
