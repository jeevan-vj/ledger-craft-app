import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { AccountPicker } from './AccountPicker';
import { accountService } from '@/services/accountService';

jest.mock('@/services/accountService', () => ({ accountService: { fetchAccounts: jest.fn() } }));

it('offers only active settlement accounts, excluding revenue, expense and custom ledger accounts', async () => {
  jest.mocked(accountService.fetchAccounts).mockResolvedValue([
    { id: 'bank', name: 'Operating bank', type: 'bank', isActive: true, currency: 'NZD' },
    { id: 'cash', name: 'Cash drawer', type: 'cash', isActive: true, currency: 'NZD' },
    { id: 'card', name: 'Business card', type: 'credit_card', isActive: true, currency: 'NZD' },
    { id: 'loan', name: 'Business loan', type: 'loan', isActive: true, currency: 'NZD' },
    { id: 'inactive', name: 'Closed bank', type: 'bank', isActive: false, currency: 'NZD' },
    { id: 'revenue', name: 'Sales revenue', type: 'revenue', isActive: true, currency: 'NZD' },
    { id: 'expense', name: 'Office cost', type: 'expense', isActive: true, currency: 'NZD' },
    { id: 'custom', name: 'Custom ledger', type: 'custom', isActive: true, currency: 'NZD' },
  ] as never);
  const onSelect = jest.fn();
  const screen = render(<AccountPicker visible onSelect={onSelect} onClose={jest.fn()} />);
  await screen.findByText('Operating bank');
  for (const name of ['Cash drawer', 'Business card', 'Business loan']) expect(screen.getByText(name)).toBeTruthy();
  for (const name of ['Closed bank', 'Sales revenue', 'Office cost', 'Custom ledger']) expect(screen.queryByText(name)).toBeNull();
  fireEvent.press(screen.getByText('Operating bank'));
  expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'bank' }));
});
