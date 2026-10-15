
import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { AuthSession, AuthUser } from '@/types/auth-user';
import { useNavigate } from 'react-router-dom';
import { businessProfileService } from '../services/supabaseService';

interface AuthContextType {
  user: AuthUser | null;
  session: AuthSession | null;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: any; data?: any; needsEmailConfirmation?: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signInWithGoogle: () => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  loading: boolean;
  hasCompletedOnboarding: boolean;
  onboardingChecked: boolean;
  refreshUser: () => Promise<void>;
  retryOnboardingCheck: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [lastCheckedUserId, setLastCheckedUserId] = useState<string | null>(null);
  const navigate = useNavigate();

  const checkOnboardingStatus = async (userId: string) => {
    // Don't check again if already checked for this specific user
    if (onboardingChecked && lastCheckedUserId === userId) {
      console.log('AuthContext: Onboarding status already checked for this user, skipping...');
      return;
    }
    
    // Prevent multiple simultaneous checks
    if ((checkOnboardingStatus as any).isChecking) {
      console.log('AuthContext: Onboarding check already in progress, skipping...');
      return;
    }
    
    try {
      (checkOnboardingStatus as any).isChecking = true;
      console.log('AuthContext: Starting onboarding check for user:', userId);
      
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Onboarding check timeout')), 10000);
      });
      
      const businessProfilePromise = businessProfileService.getBusinessProfile();
      
      const businessProfile = await Promise.race([businessProfilePromise, timeoutPromise]);
      console.log('AuthContext: Business profile found:', !!businessProfile);
      
      // Set onboarding status based on business profile
      const isOnboarded = !!businessProfile;
      setHasCompletedOnboarding(isOnboarded);
      setOnboardingChecked(true);
      setLastCheckedUserId(userId);
      
      console.log('AuthContext: Onboarding status set to:', isOnboarded);
      
    } catch (error) {
      console.error('AuthContext: Error checking onboarding status:', error);
      
      // On error, don't assume anything - let the user retry
      // Keep the current onboarding status if we had one before
      if (!hasCompletedOnboarding) {
        setHasCompletedOnboarding(false);
      }
      setOnboardingChecked(true);
      
      console.log('AuthContext: Onboarding status check failed, keeping current status');
    } finally {
      (checkOnboardingStatus as any).isChecking = false;
      console.log('AuthContext: Onboarding check completed');
    }
  };

  const refreshUser = async () => {
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    setSession(currentSession);
    setUser(currentSession?.user ?? null);
    
    if (currentSession?.user?.id) {
      // Only reset onboarding check if it's a different user
      if (lastCheckedUserId !== currentSession.user.id) {
        setOnboardingChecked(false);
        setLastCheckedUserId(null);
      }
      await checkOnboardingStatus(currentSession.user.id);
    }
  };

  // Function to retry onboarding check if needed
  const retryOnboardingCheck = async () => {
    if (user?.id) {
      console.log('Retrying onboarding check...');
      setOnboardingChecked(false);
      setLastCheckedUserId(null);
      setHasCompletedOnboarding(false);
      await checkOnboardingStatus(user.id);
    }
  };

  useEffect(() => {
    let isMounted = true;

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, currentSession) => {
        if (!isMounted) return;
        
        console.log('Auth state change:', event, !!currentSession?.user);
        
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
        
        if (currentSession?.user?.id) {
          // Only handle specific auth events that require onboarding checks
          if (event === 'SIGNED_IN') {
            console.log('User signed in, checking onboarding status...');
            setOnboardingChecked(false);
            setHasCompletedOnboarding(false);
            await checkOnboardingStatus(currentSession.user.id);
          } else if (event === 'TOKEN_REFRESHED') {
            console.log('Token refreshed - no onboarding check needed');
            // Don't check onboarding on token refresh - user is already authenticated
          } else {
            console.log(`Auth event ${event} - no onboarding check needed`);
          }
        } else {
          console.log('No user session, resetting onboarding status');
          setHasCompletedOnboarding(false);
          setOnboardingChecked(true);
        }
        
        if (event === 'SIGNED_OUT') {
          console.log('User signed out, redirecting to login');
          setHasCompletedOnboarding(false);
          setOnboardingChecked(false);
          setLastCheckedUserId(null);
          navigate('/login');
        }
      }
    );

    // Check for existing session
    const checkSession = async () => {
      if (!isMounted) return;
      
      try {
        console.log('AuthContext: Starting session check...');
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        console.log('AuthContext: Session retrieved:', !!currentSession?.user);
        
        if (!isMounted) return;
        
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
        
        if (currentSession?.user?.id) {
          console.log('AuthContext: User found, checking onboarding...');
          await checkOnboardingStatus(currentSession.user.id);
        } else {
          console.log('AuthContext: No user, setting defaults...');
          setOnboardingChecked(true);
          setHasCompletedOnboarding(false);
        }
      } catch (error) {
        console.error('AuthContext: Error checking session:', error);
        if (isMounted) {
          setOnboardingChecked(true);
          setHasCompletedOnboarding(false);
        }
      } finally {
        if (isMounted) {
          console.log('AuthContext: Setting loading to false');
          setLoading(false);
        }
      }
    };

    checkSession();

    // Cleanup subscription and prevent memory leaks
    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - this should only run once on mount

  const signUp = async (email: string, password: string, fullName?: string) => {
    setLoading(true);
    const { error, data } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName
        }
      }
    });
    setLoading(false);
    
    // Return additional info about the sign-up result
    return { 
      error, 
      data,
      needsEmailConfirmation: !error && !data.session && data.user && !data.user.email_confirmed_at
    };
  };

  const signIn = async (email: string, password: string) => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    setLoading(false);
    return { error };
  };

  const signInWithGoogle = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`
      }
    });
    setLoading(false);
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const value = {
    user,
    session,
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
    loading,
    hasCompletedOnboarding,
    onboardingChecked,
    refreshUser,
    retryOnboardingCheck
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
