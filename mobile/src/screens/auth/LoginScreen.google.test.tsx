import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme';
import { getAuthProviders } from '@/features/auth/api/authApi';
import LoginScreen from './LoginScreen';

const mockSignInWithGoogle = jest.fn();
const mockReplace = jest.fn();

jest.mock('@/features/auth/api/authApi', () => ({
  authErrorMessage: (error: { message?: string }) => error.message ?? 'Something went wrong.',
  getAuthProviders: jest.fn(),
}));

jest.mock('@/store', () => ({
  useAuth: () => ({ signIn: jest.fn(), signInWithGoogle: mockSignInWithGoogle }),
  useStore: { getState: () => ({ hasCompletedOnboarding: false }) },
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), replace: mockReplace }),
}));

function renderLogin() {
  return render(
    <ThemeProvider>
      <LoginScreen />
    </ThemeProvider>,
  );
}

describe('login Google button', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  it('hides Continue with Google until the provider is enabled', async () => {
    (getAuthProviders as jest.Mock).mockResolvedValueOnce({ google: false });
    const hidden = renderLogin();
    await waitFor(() => expect(getAuthProviders).toHaveBeenCalled());
    expect(hidden.queryByText('Continue with Google')).toBeNull();
    hidden.unmount();

    (getAuthProviders as jest.Mock).mockResolvedValueOnce({ google: true });
    const shown = renderLogin();
    expect(await shown.findByText('Continue with Google')).toBeTruthy();
  });

  it('shows a denied error and ignores a cancelled browser', async () => {
    (getAuthProviders as jest.Mock).mockResolvedValue({ google: true });
    mockSignInWithGoogle.mockResolvedValueOnce({ error: { message: 'Google sign-in was denied.' } });
    const view = renderLogin();
    fireEvent.press(await view.findByText('Continue with Google'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Google sign-in', 'Google sign-in was denied.'));

    mockSignInWithGoogle.mockResolvedValueOnce({ error: null, cancelled: true });
    fireEvent.press(view.getByText('Continue with Google'));
    await waitFor(() => expect(mockSignInWithGoogle).toHaveBeenCalledTimes(2));
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();

    mockSignInWithGoogle.mockResolvedValueOnce({ error: null });
    fireEvent.press(view.getByText('Continue with Google'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('Onboarding'));
  });
});
