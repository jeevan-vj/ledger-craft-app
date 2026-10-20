import * as SecureStore from 'expo-secure-store';
import type { GstRegistrationStatus, SafeAccountDraft } from './onboardingModel';

const INTRO_KEY = 'ledgercraft.onboarding.intro.v1';
const ACCOUNT_KEY = 'ledgercraft.onboarding.account.v1';
const BUSINESS_KEY = 'ledgercraft.onboarding.business.v1';

export interface BusinessDraft {
  step: number;
  businessName: string;
  country: string;
  gstRegistrationStatus: GstRegistrationStatus;
}

async function readJson<T>(key: string): Promise<T | null> {
  const value = await SecureStore.getItemAsync(key);
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    await SecureStore.deleteItemAsync(key);
    return null;
  }
}

export const onboardingStorage = {
  async hasSeenIntro(): Promise<boolean> {
    return (await SecureStore.getItemAsync(INTRO_KEY)) === 'seen';
  },
  async markIntroSeen(): Promise<void> {
    await SecureStore.setItemAsync(INTRO_KEY, 'seen');
  },
  loadAccountDraft: () => readJson<SafeAccountDraft>(ACCOUNT_KEY),
  saveAccountDraft: (draft: SafeAccountDraft) => SecureStore.setItemAsync(ACCOUNT_KEY, JSON.stringify(draft)),
  clearAccountDraft: () => SecureStore.deleteItemAsync(ACCOUNT_KEY),
  loadBusinessDraft: () => readJson<BusinessDraft>(BUSINESS_KEY),
  saveBusinessDraft: (draft: BusinessDraft) => SecureStore.setItemAsync(BUSINESS_KEY, JSON.stringify(draft)),
  clearBusinessDraft: () => SecureStore.deleteItemAsync(BUSINESS_KEY),
};
