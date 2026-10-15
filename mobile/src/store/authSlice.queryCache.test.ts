import { createStore } from 'zustand/vanilla';
import { appQueryClient } from '@/lib/queryClient';
import { createAuthSlice, type AuthSlice } from './authSlice';

jest.mock('@/features/auth/api/authApi', () => ({
  AuthApiError: class AuthApiError extends Error {},
  getMe: jest.fn(),
  signInEmail: jest.fn(),
  signOutSession: jest.fn().mockResolvedValue(undefined),
  signUpEmail: jest.fn(),
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
});
