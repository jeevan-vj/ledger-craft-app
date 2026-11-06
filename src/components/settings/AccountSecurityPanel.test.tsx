import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountSecurityPanel } from './AccountSecurityPanel';

const listAccountSessions = vi.fn();
const revokeAccountSession = vi.fn();
const revokeAllSessions = vi.fn();
const revokeOtherSessions = vi.fn();
const signOut = vi.fn();

vi.mock('@/features/auth/api/authApi', () => ({
  changeEmail: vi.fn(),
  changePassword: vi.fn(),
  listAccountSessions: (...args: unknown[]) => listAccountSessions(...args),
  revokeAccountSession: (...args: unknown[]) => revokeAccountSession(...args),
  revokeAllSessions: (...args: unknown[]) => revokeAllSessions(...args),
  revokeOtherSessions: (...args: unknown[]) => revokeOtherSessions(...args),
}));
vi.mock('@/context/StableAuthContext', () => ({
  useAuth: () => ({ signOut, refreshUser: vi.fn() }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

describe('AccountSecurityPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listAccountSessions.mockResolvedValue([
      { token: 'current-token', current: true, createdAt: new Date('2026-11-06T00:00:00Z') },
      { token: 'other-token', current: false, createdAt: new Date('2026-11-05T00:00:00Z') },
    ]);
    revokeAccountSession.mockResolvedValue(undefined);
    revokeOtherSessions.mockResolvedValue(undefined);
    revokeAllSessions.mockResolvedValue(undefined);
    signOut.mockRejectedValue(new Error('The current session is already revoked'));
  });

  it('labels the current session and revokes another device', async () => {
    render(<AccountSecurityPanel />);
    expect(await screen.findByText(/^Signed-in device \(this browser\)$/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out device' }));
    await waitFor(() => expect(revokeAccountSession).toHaveBeenCalledWith('other-token'));
  });

  it('signs out everywhere without surfacing the expected already-revoked current session', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<AccountSecurityPanel />);
    await screen.findByText(/^Signed-in device \(this browser\)$/i);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out everywhere' }));
    await waitFor(() => expect(revokeAllSessions).toHaveBeenCalledTimes(1));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('shows a recoverable device-list network failure', async () => {
    listAccountSessions.mockRejectedValue(new Error('Check your connection and try again.'));
    render(<AccountSecurityPanel />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Check your connection and try again.');
  });
});
