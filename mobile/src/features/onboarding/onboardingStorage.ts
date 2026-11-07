import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { GstRegistrationStatus, SafeAccountDraft } from './onboardingModel';

const INTRO_KEY = 'ledgercraft.onboarding.intro.v1';
const ACCOUNT_KEY = 'ledgercraft.onboarding.account.v1';
const BUSINESS_KEY = 'ledgercraft.onboarding.business.v1';
export const FIRST_INVOICE_PROMPT_KEY = 'ledgercraft.onboarding.firstInvoice.v1';
const FIRST_INVOICE_PENDING = 'pending';

export interface BusinessDraft {
  step: number;
  businessName: string;
  country: string;
  gstRegistrationStatus: GstRegistrationStatus;
  taxId?: string;
  gstRegisteredFrom?: string;
}

async function read(key: string): Promise<string | null> {
  return Platform.OS === 'web' ? globalThis.localStorage.getItem(key) : SecureStore.getItemAsync(key);
}
async function write(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') globalThis.localStorage.setItem(key, value);
  else await SecureStore.setItemAsync(key, value);
}
async function remove(key: string): Promise<void> {
  if (Platform.OS === 'web') globalThis.localStorage.removeItem(key);
  else await SecureStore.deleteItemAsync(key);
}

async function readJson<T>(key: string): Promise<T | null> {
  const value = await read(key);
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    await remove(key);
    return null;
  }
}

export const onboardingStorage = {
  async hasSeenIntro(): Promise<boolean> {
    return (await read(INTRO_KEY)) === 'seen';
  },
  async markIntroSeen(): Promise<void> {
    await write(INTRO_KEY, 'seen');
  },
  loadAccountDraft: () => readJson<SafeAccountDraft>(ACCOUNT_KEY),
  saveAccountDraft: (draft: SafeAccountDraft) => write(ACCOUNT_KEY, JSON.stringify(draft)),
  clearAccountDraft: () => remove(ACCOUNT_KEY),
  loadBusinessDraft: () => readJson<BusinessDraft>(BUSINESS_KEY),
  saveBusinessDraft: (draft: BusinessDraft) => write(BUSINESS_KEY, JSON.stringify(draft)),
  clearBusinessDraft: () => remove(BUSINESS_KEY),
  async markFirstInvoicePending(): Promise<void> {
    await write(FIRST_INVOICE_PROMPT_KEY, FIRST_INVOICE_PENDING);
  },
  async consumeFirstInvoicePending(): Promise<boolean> {
    try {
      const value = await read(FIRST_INVOICE_PROMPT_KEY);
      if (value !== FIRST_INVOICE_PENDING) return false;
      await remove(FIRST_INVOICE_PROMPT_KEY);
      return true;
    } catch (error) {
      console.error('Error reading the first invoice prompt:', error);
      return false;
    }
  },
};
