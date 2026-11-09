import React from 'react';
import { Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme';
import { getAuthProviders } from '@/features/auth/api/authApi';
import SignupScreen from './SignupScreen';

const mockSignInWithGoogle = jest.fn();

jest.mock('@/features/auth/api/authApi', () => ({
  authErrorMessage: (error: { message?: string }) => error.message ?? 'Something went wrong.',
  getAuthProviders: jest.fn(),
}));

jest.mock('@/features/onboarding/onboardingStorage', () => ({
  onboardingStorage: { loadAccountDraft: jest.fn(async () => null), saveAccountDraft: jest.fn() },
}));

jest.mock('@/store', () => ({
  useAuth: () => ({ signUp: jest.fn(), signInWithGoogle: mockSignInWithGoogle }),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn(), replace: jest.fn() }),
}));

describe('signup Google button', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  it('shows Continue with Google on the first step and reports a disabled provider', async () => {
    (getAuthProviders as jest.Mock).mockResolvedValue({ google: true });
    mockSignInWithGoogle.mockResolvedValueOnce({ error: { message: 'Google sign-in is not available.' } });
    const view = render(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}>
        <ThemeProvider>
          <SignupScreen />
        </ThemeProvider>
      </SafeAreaProvider>,
    );
    fireEvent.press(await view.findByText('Continue with Google'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Google sign-in', 'Google sign-in is not available.'));
  });
});
