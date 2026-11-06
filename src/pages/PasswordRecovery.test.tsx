import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForgotPassword, ResetPassword } from './PasswordRecovery';

const requestPasswordReset = vi.fn();
const resetPassword = vi.fn();
vi.mock('@/features/auth/api/authApi', () => ({
  requestPasswordReset: (...args: unknown[]) => requestPasswordReset(...args),
  resetPassword: (...args: unknown[]) => resetPassword(...args),
}));
vi.mock('@/components/auth/modern/ModernAuthLayout', () => ({ default: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));

describe('password recovery pages', () => {
  beforeEach(() => { requestPasswordReset.mockReset(); resetPassword.mockReset(); });

  it('shows the same neutral success copy after requesting a reset', async () => {
    requestPasswordReset.mockResolvedValue(undefined);
    render(<MemoryRouter><ForgotPassword /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'unknown@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByRole('status')).toHaveTextContent('If that address has an account');
    expect(requestPasswordReset).toHaveBeenCalledWith('unknown@example.com');
  });

  it('keeps the form recoverable when the reset request is offline', async () => {
    requestPasswordReset.mockRejectedValue(new Error('Check your connection and try again.'));
    render(<MemoryRouter><ForgotPassword /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'owner@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Check your connection and try again.');
    expect(screen.getByRole('button', { name: 'Send reset link' })).toBeEnabled();
  });

  it('does not submit an expired callback and explains that every device is signed out on success', async () => {
    const expired = render(<MemoryRouter initialEntries={['/reset-password?error=INVALID_TOKEN']}><ResetPassword /></MemoryRouter>);
    expect(screen.getByRole('alert')).toHaveTextContent('invalid or has expired');
    expect(screen.getByRole('button', { name: 'Reset password' })).toBeDisabled();
    expired.unmount();

    resetPassword.mockResolvedValue(undefined);
    render(<MemoryRouter initialEntries={['/reset-password?token=valid-token']}><ResetPassword /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-password123' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'new-password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));
    await waitFor(() => expect(resetPassword).toHaveBeenCalledWith('valid-token', 'new-password123'));
    expect(await screen.findByRole('status')).toHaveTextContent('every other device');
  });
});
