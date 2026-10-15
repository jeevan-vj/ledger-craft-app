/**
 * Authentication Slice - Pure auth logic only
 * Single responsibility: Managing authentication state
 */

import { StateCreator } from 'zustand';
import type { AuthSession, AuthUser } from '@/types/auth-user';
import { supabase } from '@/integrations/supabase/client';
import { businessProfileService } from '@/services/supabaseService';

export interface AuthSlice {
  // State
  user: AuthUser | null;
  session: AuthSession | null;
  loading: boolean;
  hasCompletedOnboarding: boolean;
  onboardingChecked: boolean;
  error: string | null;
  
  // Actions
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: any; data?: any; needsEmailConfirmation?: boolean }>;
  signInWithGoogle: () => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  checkOnboardingStatus: () => Promise<void>;
  refreshUser: () => Promise<void>;
  
  // Internal state updaters
  setUser: (user: AuthUser | null) => void;
  setSession: (session: AuthSession | null) => void;
  setLoading: (loading: boolean) => void;
  setOnboardingStatus: (completed: boolean, checked: boolean) => void;
  setError: (error: string | null) => void;
  
  // Auth event handlers
  handleAuthStateChange: (event: string, session: AuthSession | null) => void;
  initialize: () => Promise<void>;
}

export const createAuthSlice: StateCreator<
  AuthSlice,
  [["zustand/immer", never], ["zustand/devtools", never], ["zustand/subscribeWithSelector", never]],
  [],
  AuthSlice
> = (set, get) => ({
  // Initial state
  user: null,
  session: null,
  loading: true,
  hasCompletedOnboarding: false,
  onboardingChecked: false,
  error: null,

  // Actions
  signIn: async (email: string, password: string) => {
    set((state) => {
      state.loading = true;
      state.error = null;
    });

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      set((state) => {
        state.loading = false;
        state.error = error.message;
      });
    }

    return { error };
  },

  signUp: async (email: string, password: string, fullName?: string) => {
    set((state) => {
      state.loading = true;
      state.error = null;
    });

    const { error, data } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });

    if (error) {
      set((state) => {
        state.loading = false;
        state.error = error.message;
      });
      return { error };
    }

    const needsEmailConfirmation = !data.session && data.user && !data.user.email_confirmed_at;

    if (!needsEmailConfirmation) {
      set((state) => {
        state.loading = false;
      });
    }

    return { error: null, data, needsEmailConfirmation };
  },

  signInWithGoogle: async () => {
    set((state) => {
      state.loading = true;
      state.error = null;
    });

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      set((state) => {
        state.loading = false;
        state.error = error.message;
      });
    }

    return { error };
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set((state) => {
      state.user = null;
      state.session = null;
      state.hasCompletedOnboarding = false;
      state.onboardingChecked = false;
      state.error = null;
    });
  },

  checkOnboardingStatus: async () => {
    const { user } = get();
    if (!user) return;

    try {
      const businessProfile = await businessProfileService.getBusinessProfile();
      const isOnboarded = !!businessProfile;
      
      set((state) => {
        state.hasCompletedOnboarding = isOnboarded;
        state.onboardingChecked = true;
      });
    } catch (error) {
      console.error('Error checking onboarding status:', error);
      set((state) => {
        state.onboardingChecked = true;
      });
    }
  },

  refreshUser: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    set((state) => {
      state.user = user;
    });
  },

  // State updaters
  setUser: (user) => set((state) => { state.user = user; }),
  setSession: (session) => set((state) => { state.session = session; }),
  setLoading: (loading) => set((state) => { state.loading = loading; }),
  setOnboardingStatus: (completed, checked) => set((state) => {
    state.hasCompletedOnboarding = completed;
    state.onboardingChecked = checked;
  }),
  setError: (error) => set((state) => { state.error = error; }),

  // Auth event handlers
  handleAuthStateChange: async (event: string, session: AuthSession | null) => {
    console.log('Auth state change:', event);
    
    set((state) => {
      state.session = session;
      state.user = session?.user ?? null;
    });

    if (event === 'SIGNED_IN' && session?.user) {
      set((state) => {
        state.loading = false;
        state.onboardingChecked = false;
        state.hasCompletedOnboarding = false;
      });
      await get().checkOnboardingStatus();
    } else if (event === 'SIGNED_OUT') {
      set((state) => {
        state.user = null;
        state.session = null;
        state.hasCompletedOnboarding = false;
        state.onboardingChecked = false;
        state.loading = false;
        state.error = null;
      });
    } else if (event === 'TOKEN_REFRESHED') {
      // Don't trigger onboarding check on token refresh
      set((state) => {
        state.loading = false;
      });
    }
  },

  // Initialize auth listener
  initialize: async () => {
    // Set up auth state listener
    supabase.auth.onAuthStateChange(async (event, session) => {
      await get().handleAuthStateChange(event, session);
    });

    // Check current session
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await get().handleAuthStateChange('INITIAL_SESSION', session);
      } else {
        set((state) => {
          state.loading = false;
          state.onboardingChecked = true;
        });
      }
    } catch (error) {
      console.error('Error initializing auth:', error);
      set((state) => {
        state.loading = false;
        state.error = 'Failed to initialize authentication';
      });
    }
  },
});
