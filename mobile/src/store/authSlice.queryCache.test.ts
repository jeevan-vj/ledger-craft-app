import { createStore } from 'zustand/vanilla';
import { appQueryClient } from '@/lib/queryClient';
import { createAuthSlice, type AuthSlice } from './authSlice';
import { businessProfileApi } from '@/features/business-profile/api/businessProfileApi';

jest.mock('@/features/auth/api/authApi', () => ({
  AuthApiError: class AuthApiError extends Error {},
  getMe: jest.fn(),
  signInEmail: jest.fn(),
  signOutSession: jest.fn().mockResolvedValue(undefined),
  signUpEmail: jest.fn(),
}));

jest.mock('@/features/business-profile/api/businessProfileApi', () => ({
  businessProfileApi: { get: jest.fn() },
}));

describe('auth session cache isolation', () => {
  afterEach(() => {
    appQueryClient.clear();
  });

  it('clears organisation-scoped server state during sign out', async () => {
    const store = createStore<AuthSlice>()(createAuthSlice);
    appQueryClient.setQueryData(['purchases', 'bills'], [{ id: 'bill-from-user-a' }]);

    await store.getState().signOut();

    expect(appQueryClient.getQueryData(['purchases', 'bills'])).toBeUndefined();
    expect(store.getState().user).toBeNull();
  });

  it('keeps a newly created account in onboarding until a profile exists', async () => {
    const authApi = jest.requireMock('@/features/auth/api/authApi') as {
      signUpEmail: jest.Mock;
      getMe: jest.Mock;
    };
    authApi.signUpEmail.mockResolvedValue(undefined);
    authApi.getMe.mockResolvedValue({
      user: { id: 'u1', email: 'owner@example.com', name: 'Owner' },
      organisation: { id: '11111111-1111-1111-1111-111111111111', name: 'Owner' },
      membership: { role: 'owner' },
    });
    (businessProfileApi.get as jest.Mock).mockResolvedValue(null);
    const store = createStore<AuthSlice>()(createAuthSlice);

    await store.getState().signUp('owner@example.com', 'password123', 'Owner');

    expect(store.getState().hasCompletedOnboarding).toBe(false);
    expect(store.getState().onboardingChecked).toBe(true);
  });
});
