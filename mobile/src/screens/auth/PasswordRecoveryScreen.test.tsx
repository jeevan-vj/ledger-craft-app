import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { ForgotPasswordScreen, ResetPasswordScreen } from './PasswordRecoveryScreen';
import { requestPasswordReset, resetPassword } from '@/features/auth/api/authApi';

jest.mock('@/features/auth/api/authApi', () => ({
  requestPasswordReset: jest.fn(),
  resetPassword: jest.fn(),
}));
jest.mock('@/store', () => ({ useAuth: () => ({ signOut: jest.fn() }) }));

const navigate = jest.fn();
const replace = jest.fn();

function forgotProps() {
  return { navigation: { navigate }, route: { key: 'forgot', name: 'ForgotPassword' } } as unknown as React.ComponentProps<typeof ForgotPasswordScreen>;
}

function resetProps(params?: { token?: string; error?: string }) {
  return { navigation: { replace }, route: { key: 'reset', name: 'ResetPassword', params } } as unknown as React.ComponentProps<typeof ResetPasswordScreen>;
}

describe('mobile password recovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  it('shows neutral reset-request success copy for any submitted address', async () => {
    (requestPasswordReset as jest.Mock).mockResolvedValue(undefined);
    const view = render(<ForgotPasswordScreen {...forgotProps()} />);
    fireEvent.changeText(view.getByLabelText('Email address'), 'unknown@example.com');
    fireEvent.press(view.getByRole('button', { name: 'Send reset link' }));
    expect(await view.findByText(/If that address has an account/i)).toBeTruthy();
    expect(requestPasswordReset).toHaveBeenCalledWith('unknown@example.com');
  });

  it('reports an offline request without claiming that mail was sent', async () => {
    (requestPasswordReset as jest.Mock).mockRejectedValue(new Error('Check your connection and try again.'));
    const view = render(<ForgotPasswordScreen {...forgotProps()} />);
    fireEvent.changeText(view.getByLabelText('Email address'), 'owner@example.com');
    fireEvent.press(view.getByRole('button', { name: 'Send reset link' }));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Couldn’t send link', 'Check your connection and try again.'));
    expect(view.queryByText(/If that address has an account/i)).toBeNull();
  });

  it('blocks an expired callback and completes a valid reset', async () => {
    const expired = render(<ResetPasswordScreen {...resetProps({ error: 'INVALID_TOKEN' })} />);
    expect(expired.getByRole('alert')).toHaveTextContent(/invalid or has expired/i);
    fireEvent.press(expired.getByRole('button', { name: 'Request a new link' }));
    expect(replace).toHaveBeenCalledWith('ForgotPassword');
    expired.unmount();

    (resetPassword as jest.Mock).mockResolvedValue(undefined);
    const valid = render(<ResetPasswordScreen {...resetProps({ token: 'single-use-token' })} />);
    fireEvent.changeText(valid.getByLabelText('New password'), 'new-password123');
    fireEvent.changeText(valid.getByLabelText('Confirm new password'), 'new-password123');
    fireEvent.press(valid.getByRole('button', { name: 'Reset password' }));
    await waitFor(() => expect(resetPassword).toHaveBeenCalledWith('single-use-token', 'new-password123'));
    expect(await valid.findByText(/every other device/i)).toBeTruthy();
  });
});
