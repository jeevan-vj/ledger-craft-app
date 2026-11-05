import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import AccountDeletionScreen from './AccountDeletionScreen';
import { deleteAccount } from '@/features/auth/api/authApi';

const mockSignOut = jest.fn();
const mockNavigate = jest.fn();
jest.mock('@/store', () => ({ useAuth: () => ({ signOut: mockSignOut }) }));
jest.mock('@/features/auth/api/authApi', () => ({ deleteAccount: jest.fn() }));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));

describe('AccountDeletionScreen', () => {
  beforeEach(() => { jest.clearAllMocks(); mockSignOut.mockResolvedValue(undefined); });

  it('requires password plus DELETE, sends the request, and signs out', async () => {
    (deleteAccount as jest.Mock).mockResolvedValue({ deleted: true, deletedAt: '2026-11-06T00:00:00.000Z' });
    const view = render(<AccountDeletionScreen />);
    expect(view.getByText(/7 years/i)).toBeTruthy();
    expect(view.getByRole('button', { name: 'Permanently delete account' })).toHaveProp('accessibilityState', { disabled: true, busy: false });
    fireEvent.changeText(view.getByLabelText('Current password'), 'password123');
    fireEvent.changeText(view.getByLabelText('Type DELETE to confirm'), 'DELETE');
    fireEvent.press(view.getByRole('button', { name: 'Permanently delete account' }));
    await waitFor(() => expect(deleteAccount).toHaveBeenCalledWith({ password: 'password123', confirmation: 'DELETE' }));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('shows the actionable ownership blocker and stays signed in', async () => {
    (deleteAccount as jest.Mock).mockRejectedValue(new Error('Transfer ownership or remove the other members before deleting your account.'));
    const view = render(<AccountDeletionScreen />);
    fireEvent.changeText(view.getByLabelText('Current password'), 'password123');
    fireEvent.changeText(view.getByLabelText('Type DELETE to confirm'), 'DELETE');
    fireEvent.press(view.getByRole('button', { name: 'Permanently delete account' }));
    expect(await view.findByRole('alert')).toHaveTextContent(/transfer ownership/i);
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});
