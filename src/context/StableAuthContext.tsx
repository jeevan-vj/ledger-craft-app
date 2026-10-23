/**
 * HMR-safe auth context. Web sessions are Better Auth HttpOnly cookies via Hono.
 */

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { MeResponse } from '@ledgercraft/contracts';
import { AuthApiError, getMe, signInEmail, signOutSession, signUpEmail } from '@/features/auth/api/authApi';
import { setSentryUser } from '@/lib/sentry/init';

export type AuthUser = {
  id: string;
  email: string;
  user_metadata: { full_name?: string };
};

interface AuthContextValue {
  readonly user: AuthUser | null;
  readonly session: { user: AuthUser } | null;
  readonly loading: boolean;
  readonly hasCompletedOnboarding: boolean;
  readonly onboardingChecked: boolean;
  readonly me: MeResponse | null;
  readonly signUp: (
    email: string,
    password: string,
    fullName?: string,
  ) => Promise<{ error: { message: string } | null; data?: unknown; needsEmailConfirmation?: boolean }>;
  readonly signIn: (email: string, password: string) => Promise<{ error: { message: string } | null }>;
  readonly signInWithGoogle: () => Promise<{ error: { message: string } | null }>;
  readonly signOut: () => Promise<void>;
  readonly refreshUser: () => Promise<void>;
  readonly retryOnboardingCheck: () => Promise<void>;
  readonly markOnboardingComplete: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);
AuthContext.displayName = 'AuthContext';

function toAuthUser(me: MeResponse): AuthUser {
  return {
    id: me.user.id,
    email: me.user.email,
    user_metadata: { full_name: me.user.name },
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

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [me, setMe] = useState<MeResponse | null>(null);
  const navigate = useNavigate();

  const applySession = useCallback((me: MeResponse | null) => {
    if (!me) {
      setSentryUser(null);
      setMe(null);
      setUser(null);
      setHasCompletedOnboarding(false);
      setOnboardingChecked(true);
      return;
    }
    setSentryUser(me.user.id);
    setMe(me);
    setUser(toAuthUser(me));
    // Business profile is still on supabase-js. A Better Auth session is enough to enter the app.
    setHasCompletedOnboarding(true);
    setOnboardingChecked(true);
  }, []);

  const refreshUser = useCallback(async () => {
    applySession(await getMe());
  }, [applySession]);

  const signUp = useCallback(
    async (email: string, password: string, fullName?: string) => {
      setLoading(true);
      try {
        await signUpEmail({
          name: fullName?.trim() || email.split('@')[0] || 'Owner',
          email,
          password,
        });
        applySession(await getMe());
        return { error: null, needsEmailConfirmation: false };
      } catch (error) {
        return { error: toAuthError(error) };
      } finally {
        setLoading(false);
      }
    },
    [applySession],
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      setLoading(true);
      try {
        await signInEmail({ email, password });
        applySession(await getMe());
        return { error: null };
      } catch (error) {
        return { error: toAuthError(error) };
      } finally {
        setLoading(false);
      }
    },
    [applySession],
  );

  const signInWithGoogle = useCallback(async () => {
    return {
      error: { message: 'Google sign-in is not available yet. Use email and password.' },
    };
  }, []);

  const signOut = useCallback(async () => {
    try {
      await signOutSession();
    } finally {
      applySession(null);
      navigate('/login');
    }
  }, [applySession, navigate]);

  const retryOnboardingCheck = useCallback(async () => {
    await refreshUser();
  }, [refreshUser]);

  const markOnboardingComplete = useCallback(() => {
    setHasCompletedOnboarding(true);
    setOnboardingChecked(true);
  }, []);

  useEffect(() => {
    let isMounted = true;
    const checkSession = async () => {
      try {
        const me = await getMe();
        if (isMounted) {
          applySession(me);
        }
      } catch {
        if (isMounted) {
          applySession(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };
    void checkSession();
    return () => {
      isMounted = false;
    };
  }, [applySession]);

  const session = user ? { user } : null;

  const contextValue = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      loading,
      hasCompletedOnboarding,
      onboardingChecked,
      me,
      signUp,
      signIn,
      signInWithGoogle,
      signOut,
      refreshUser,
      retryOnboardingCheck,
      markOnboardingComplete,
    }),
    [
      user,
      session,
      loading,
      hasCompletedOnboarding,
      onboardingChecked,
      me,
      signUp,
      signIn,
      signInWithGoogle,
      signOut,
      refreshUser,
      retryOnboardingCheck,
      markOnboardingComplete,
    ],
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export { AuthProvider, useAuth };
