/**
 * Auth Slice Tests
 * Testing the new authentication logic in isolation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStore } from '../index';

// Mock Supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signInWithOAuth: vi.fn(),
      signOut: vi.fn(),
      getUser: vi.fn(),
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
    },
  },
}));

// Mock business profile service
vi.mock('@/services/supabaseService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/supabaseService')>();
  return {
    ...actual,
    businessProfileService: {
      ...actual.businessProfileService,
      getBusinessProfile: vi.fn(),
    },
  };
});

describe('Auth Slice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Reset store state
    const { result } = renderHook(() => useStore());
    act(() => {
      result.current.setUser(null);
      result.current.setSession(null);
      result.current.setLoading(false);
      result.current.setOnboardingStatus(false, false);
      result.current.setError(null);
    });
  });

  describe('Initial State', () => {
    it('should have correct initial state', () => {
      const { result } = renderHook(() => useStore());
      
      expect(result.current.user).toBeNull();
      expect(result.current.session).toBeNull();
      expect(result.current.loading).toBe(true);
      expect(result.current.hasCompletedOnboarding).toBe(false);
      expect(result.current.onboardingChecked).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  describe('Sign In', () => {
    it('should handle successful sign in', async () => {
      const { supabase } = await import('@/integrations/supabase/client');
      
      // Mock successful sign in
      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
        data: { user: { id: 'test-user-id' }, session: {} },
        error: null,
      });

      const { result } = renderHook(() => useStore());

      await act(async () => {
        const response = await result.current.signIn('test@example.com', 'password');
        expect(response.error).toBeNull();
      });

      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password',
      });
    });

    it('should handle sign in error', async () => {
      const { supabase } = await import('@/integrations/supabase/client');
      
      const mockError = { message: 'Invalid credentials' };
      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
        data: { user: null, session: null },
        error: mockError,
      });

      const { result } = renderHook(() => useStore());

      await act(async () => {
        const response = await result.current.signIn('test@example.com', 'wrong-password');
        expect(response.error).toEqual(mockError);
      });

      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe('Invalid credentials');
    });
  });

  describe('Sign Up', () => {
    it('should handle successful sign up', async () => {
      const { supabase } = await import('@/integrations/supabase/client');
      
      vi.mocked(supabase.auth.signUp).mockResolvedValue({
        data: { 
          user: { id: 'new-user-id', email_confirmed_at: new Date().toISOString() }, 
          session: {} 
        },
        error: null,
      });

      const { result } = renderHook(() => useStore());

      await act(async () => {
        const response = await result.current.signUp('new@example.com', 'password', 'New User');
        expect(response.error).toBeNull();
        expect(response.needsEmailConfirmation).toBe(false);
      });
    });

    it('should detect email confirmation needed', async () => {
      const { supabase } = await import('@/integrations/supabase/client');
      
      vi.mocked(supabase.auth.signUp).mockResolvedValue({
        data: { 
          user: { id: 'new-user-id', email_confirmed_at: null }, 
          session: null 
        },
        error: null,
      });

      const { result } = renderHook(() => useStore());

      await act(async () => {
        const response = await result.current.signUp('new@example.com', 'password');
        expect(response.needsEmailConfirmation).toBe(true);
      });
    });
  });

  describe('Sign Out', () => {
    it('should clear state on sign out', async () => {
      const { supabase } = await import('@/integrations/supabase/client');
      
      vi.mocked(supabase.auth.signOut).mockResolvedValue({ error: null });

      const { result } = renderHook(() => useStore());

      // Set some initial state
      act(() => {
        result.current.setUser({ id: 'user-id' } as any);
        result.current.setOnboardingStatus(true, true);
        result.current.setError('Some error');
      });

      await act(async () => {
        await result.current.signOut();
      });

      expect(result.current.user).toBeNull();
      expect(result.current.session).toBeNull();
      expect(result.current.hasCompletedOnboarding).toBe(false);
      expect(result.current.onboardingChecked).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  describe('Onboarding Check', () => {
    it('should set onboarding complete when business profile exists', async () => {
      const { businessProfileService } = await import('@/services/supabaseService');
      
      vi.mocked(businessProfileService.getBusinessProfile).mockResolvedValue({
        id: 'profile-id',
        name: 'Test Business',
      } as any);

      const { result } = renderHook(() => useStore());

      // Set user first
      act(() => {
        result.current.setUser({ id: 'user-id' } as any);
      });

      await act(async () => {
        await result.current.checkOnboardingStatus();
      });

      expect(result.current.hasCompletedOnboarding).toBe(true);
      expect(result.current.onboardingChecked).toBe(true);
    });

    it('should set onboarding incomplete when no business profile', async () => {
      const { businessProfileService } = await import('@/services/supabaseService');
      
      vi.mocked(businessProfileService.getBusinessProfile).mockResolvedValue(null);

      const { result } = renderHook(() => useStore());

      // Set user first
      act(() => {
        result.current.setUser({ id: 'user-id' } as any);
      });

      await act(async () => {
        await result.current.checkOnboardingStatus();
      });

      expect(result.current.hasCompletedOnboarding).toBe(false);
      expect(result.current.onboardingChecked).toBe(true);
    });

    it('should handle onboarding check errors gracefully', async () => {
      const { businessProfileService } = await import('@/services/supabaseService');
      
      vi.mocked(businessProfileService.getBusinessProfile).mockRejectedValue(
        new Error('Network error')
      );

      const { result } = renderHook(() => useStore());

      // Set user first
      act(() => {
        result.current.setUser({ id: 'user-id' } as any);
      });

      await act(async () => {
        await result.current.checkOnboardingStatus();
      });

      // Should still mark as checked even if error occurred
      expect(result.current.onboardingChecked).toBe(true);
    });
  });

  describe('Auth State Changes', () => {
    it('should handle SIGNED_IN event', async () => {
      const { result } = renderHook(() => useStore());

      const mockSession = {
        user: { id: 'user-id' },
      } as any;

      await act(async () => {
        await result.current.handleAuthStateChange('SIGNED_IN', mockSession);
      });

      expect(result.current.session).toBe(mockSession);
      expect(result.current.user).toBe(mockSession.user);
      expect(result.current.loading).toBe(false);
    });

    it('should handle SIGNED_OUT event', async () => {
      const { result } = renderHook(() => useStore());

      // Set some initial state
      act(() => {
        result.current.setUser({ id: 'user-id' } as any);
        result.current.setOnboardingStatus(true, true);
      });

      await act(async () => {
        await result.current.handleAuthStateChange('SIGNED_OUT', null);
      });

      expect(result.current.user).toBeNull();
      expect(result.current.session).toBeNull();
      expect(result.current.hasCompletedOnboarding).toBe(false);
      expect(result.current.onboardingChecked).toBe(false);
      expect(result.current.loading).toBe(false);
    });

    it('should handle TOKEN_REFRESHED event', async () => {
      const { result } = renderHook(() => useStore());

      const mockSession = {
        user: { id: 'user-id' },
      } as any;

      await act(async () => {
        await result.current.handleAuthStateChange('TOKEN_REFRESHED', mockSession);
      });

      expect(result.current.session).toBe(mockSession);
      expect(result.current.user).toBe(mockSession.user);
      expect(result.current.loading).toBe(false);
      // Should not trigger onboarding check on token refresh
    });
  });
});
