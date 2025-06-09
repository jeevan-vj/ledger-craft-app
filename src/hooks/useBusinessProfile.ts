import { useState, useEffect } from 'react';
import { BusinessProfile } from '@/types';
import { businessProfileService } from '@/services/supabaseService';

export function useBusinessProfile() {
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    fetchBusinessProfile();
  }, []);

  const fetchBusinessProfile = async () => {
    try {
      setIsLoading(true);
      const profile = await businessProfileService.getBusinessProfile();
      setBusinessProfile(profile);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch business profile'));
    } finally {
      setIsLoading(false);
    }
  };

  const updateBusinessProfile = async (profile: Omit<BusinessProfile, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      setIsLoading(true);
      const updatedProfile = await businessProfileService.createOrUpdateBusinessProfile(profile);
      setBusinessProfile(updatedProfile);
      setError(null);
      return updatedProfile;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to update business profile'));
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    businessProfile,
    isLoading,
    error,
    fetchBusinessProfile,
    updateBusinessProfile,
  };
} 