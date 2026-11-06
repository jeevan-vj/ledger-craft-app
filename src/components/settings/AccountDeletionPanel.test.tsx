import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountDeletionPanel } from './AccountDeletionPanel';

const deleteAccount = vi.fn();
const signOut = vi.fn();

vi.mock('@/features/auth/api/authApi', () => ({ deleteAccount: (...args: unknown[]) => deleteAccount(...args) }));
vi.mock('@/context/StableAuthContext', () => ({ useAuth: () => ({ signOut }) }));

describe('AccountDeletionPanel', () => {
  beforeEach(() => { deleteAccount.mockReset(); signOut.mockReset(); });

  it('requires password plus typed confirmation, deletes, then signs out', async () => {
    deleteAccount.mockResolvedValue({ deleted: true, deletedAt: '2026-11-06T00:00:00.000Z' });
    signOut.mockResolvedValue(undefined);
    render(<MemoryRouter><AccountDeletionPanel /></MemoryRouter>);

    expect(screen.getByText(/7 years/i)).toBeInTheDocument();
    expect(screen.getByText(/deletion tombstone.*indefinitely/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    const submit = screen.getByRole('button', { name: 'Permanently delete account' });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText('Type DELETE'), { target: { value: 'DELETE' } });
    fireEvent.click(submit);

    await waitFor(() => expect(deleteAccount).toHaveBeenCalledWith({ password: 'password123', confirmation: 'DELETE' }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('keeps the form open and shows a server ownership blocker', async () => {
    deleteAccount.mockRejectedValue(new Error('Transfer ownership or remove the other members before deleting your account.'));
    render(<MemoryRouter><AccountDeletionPanel /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText('Type DELETE'), { target: { value: 'DELETE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Permanently delete account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/transfer ownership/i);
    expect(signOut).not.toHaveBeenCalled();
  });
});
