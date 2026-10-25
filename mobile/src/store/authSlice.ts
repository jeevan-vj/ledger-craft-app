/**
 * Authentication Slice — Better Auth via Hono. Session cookie lives in SecureStore.
 */

import { StateCreator } from 'zustand';
import {
  AuthApiError,
  getMe,
  signInEmail,
  signOutSession,
  signUpEmail,
  type MeResponse,
} from '@/features/auth/api/authApi';
import { clearServerState } from '@/lib/queryClient';
import { businessProfileApi } from '@/features/business-profile/api/businessProfileApi';

export type AuthUser = {
  id: string;
  email: string;
  user_metadata: { full_name?: string };
};

export type AuthSession = {
  user: AuthUser;
};

export interface AuthSlice {
  user: AuthUser | null;
  session: AuthSession | null;
  permissions: string[];
  loading: boolean;
  hasCompletedOnboarding: boolean;
  onboardingChecked: boolean;
  error: string | null;

  signIn: (email: string, password: string) => Promise<{ error: { message: string } | null }>;
  signUp: (
    email: string,
    password: string,
    fullName?: string,
  ) => Promise<{
    error: { message: string } | null;
    data?: unknown;
    needsEmailConfirmation?: boolean;
  }>;
  signInWithGoogle: () => Promise<{ error: { message: string } | null }>;
  signOut: () => Promise<void>;
  checkOnboardingStatus: () => Promise<void>;
  refreshUser: () => Promise<void>;

  setUser: (user: AuthUser | null) => void;
  setSession: (session: AuthSession | null) => void;
  setLoading: (loading: boolean) => void;
  setOnboardingStatus: (completed: boolean, checked: boolean) => void;
  setError: (error: string | null) => void;
  initialize: () => Promise<void>;
}

function toAuthUser(me: MeResponse): AuthUser {
  return {
    id: me.user.id,
    email: me.user.email,
    user_metadata: { full_name: me.user.name },
  };
}

function sessionFields(me: MeResponse) {
  const user = toAuthUser(me);
  return {
    user,
    session: { user },
    permissions: [...(me.permissions ?? [])],
  };
}

function toAuthError(error: unknown): { message: string } {
  if (error instanceof AuthApiError) {
    return { message: error.message };
  }
  if (error instanceof Error) {
    return { message: error.message };
  }
  return { message: 'Something went wrong' };
}

export const createAuthSlice: StateCreator<AuthSlice> = (set, get) => ({
  user: null,
  session: null,
  permissions: [],
  loading: true,
  hasCompletedOnboarding: false,
  onboardingChecked: false,
  error: null,

  signIn: async (email: string, password: string) => {
    set({ loading: true, error: null });
    try {
      await signInEmail({ email, password });
      const me = await getMe();
      if (!me) {
        throw new AuthApiError('Signed in, but no session was returned.', 401);
      }
      const profile = await businessProfileApi.get();
      set({
        ...sessionFields(me),
        hasCompletedOnboarding: Boolean(profile),
        onboardingChecked: true,
        loading: false,
        error: null,
      });
      return { error: null };
    } catch (error) {
      const authError = toAuthError(error);
      set({ loading: false, error: authError.message });
      return { error: authError };
    }
  },

  signUp: async (email: string, password: string, fullName?: string) => {
    set({ loading: true, error: null });
    try {
      await signUpEmail({
        name: fullName?.trim() || email.split('@')[0] || 'Owner',
        email,
        password,
      });
      const me = await getMe();
      if (!me) {
        throw new AuthApiError('Account created, but no session was returned.', 401);
      }
      set({
        ...sessionFields(me),
        hasCompletedOnboarding: false,
        onboardingChecked: true,
        loading: false,
        error: null,
      });
      return { error: null, needsEmailConfirmation: false };
    } catch (error) {
      const authError = toAuthError(error);
      set({ loading: false, error: authError.message });
      return { error: authError };
    }
  },

  signInWithGoogle: async () => {
    return {
      error: { message: 'Google sign-in is not available yet. Use email and password.' },
    };
  },

  signOut: async () => {
    try {
      await signOutSession();
    } catch {
      // Local sign-out must still complete when the server call fails (offline, 4xx, 5xx).
      // apiFetch already reports network and 5xx failures to Sentry, and 4xx are not reported
      // by design, so swallow here instead of rethrowing an unhandled rejection to the
      // Settings button handler.
    } finally {
      clearServerState();
      set({
        user: null,
        session: null,
        permissions: [],
        hasCompletedOnboarding: false,
        onboardingChecked: true,
        error: null,
        loading: false,
      });
    }
  },

  checkOnboardingStatus: async () => {
    const { user } = get();
    const profile = user ? await businessProfileApi.get() : null;
    set({
      hasCompletedOnboarding: Boolean(profile),
      onboardingChecked: true,
      loading: false,
    });
  },

  refreshUser: async () => {
    const me = await getMe();
    if (!me) {
      clearServerState();
      set({
        user: null,
        session: null,
        permissions: [],
        hasCompletedOnboarding: false,
        onboardingChecked: true,
      });
      return;
    }
    const profile = await businessProfileApi.get();
    set({
      ...sessionFields(me),
      hasCompletedOnboarding: Boolean(profile),
      onboardingChecked: true,
    });
  },

  setUser: (user) => set({ user }),
  setSession: (session) => set({ session }),
  setLoading: (loading) => set({ loading }),
  setOnboardingStatus: (completed, checked) =>
    set({ hasCompletedOnboarding: completed, onboardingChecked: checked }),
  setError: (error) => set({ error }),

  initialize: async () => {
    try {
      const me = await getMe();
      if (me) {
        const profile = await businessProfileApi.get();
        set({
          ...sessionFields(me),
          hasCompletedOnboarding: Boolean(profile),
          onboardingChecked: true,
          loading: false,
          error: null,
        });
        return;
      }
      set({
        user: null,
        session: null,
        permissions: [],
        loading: false,
        onboardingChecked: true,
        hasCompletedOnboarding: false,
      });
    } catch (error) {
      console.error('Error initializing auth:', error);
      set({
        loading: false,
        onboardingChecked: true,
        error: 'Failed to initialize authentication',
      });
    }
  },
});
