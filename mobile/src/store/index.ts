/**
 * Mobile Store - Zustand state management
 * Using same middleware stack as web for consistency
 */

import { useMemo } from 'react';
import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';

import { createAuthSlice, AuthSlice } from './authSlice';

// Combined store type (will expand with app data later)
export type RootStore = AuthSlice;

// Create the store
export const useStore = create<RootStore>()(
  devtools(
    subscribeWithSelector((...args) => ({
      ...createAuthSlice(...args),
    })),
    {
      name: 'easybizinvoice-mobile-store',
    }
  )
);

// Selector hooks for performance optimization with shallow comparison
export const useAuth = () => {
  const user = useStore((state) => state.user);
  const session = useStore((state) => state.session);
  const loading = useStore((state) => state.loading);
  const hasCompletedOnboarding = useStore((state) => state.hasCompletedOnboarding);
  const onboardingChecked = useStore((state) => state.onboardingChecked);
  const signIn = useStore((state) => state.signIn);
  const signUp = useStore((state) => state.signUp);
  const signOut = useStore((state) => state.signOut);
  const signInWithGoogle = useStore((state) => state.signInWithGoogle);
  const checkOnboardingStatus = useStore((state) => state.checkOnboardingStatus);
  const setOnboardingStatus = useStore((state) => state.setOnboardingStatus);
  const initialize = useStore((state) => state.initialize);

  return useMemo(() => ({
    user,
    session,
    loading,
    hasCompletedOnboarding,
    onboardingChecked,
    signIn,
    signUp,
    signOut,
    signInWithGoogle,
    checkOnboardingStatus,
    setOnboardingStatus,
    initialize,
  }), [
    user,
    session,
    loading,
    hasCompletedOnboarding,
    onboardingChecked,
    signIn,
    signUp,
    signOut,
    signInWithGoogle,
    checkOnboardingStatus,
    setOnboardingStatus,
    initialize,
  ]);
};

