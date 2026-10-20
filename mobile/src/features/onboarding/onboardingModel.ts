export type GstRegistrationStatus = 'unknown' | 'registered' | 'not_registered';

export interface AccountDraft {
  fullName: string;
  phone: string;
  email: string;
  password: string;
  acceptedTerms: boolean;
}

export interface SafeAccountDraft {
  fullName: string;
  phone: string;
  email: string;
}

export function normalizedEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function accountStepError(step: number, draft: AccountDraft): string | null {
  if (step === 0 && draft.fullName.trim().length < 2) return 'Enter your full name.';
  if (step === 1 && draft.phone.trim() && draft.phone.replace(/\D/g, '').length < 7) {
    return 'Enter a valid phone number or leave it blank.';
  }
  if (step === 2 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail(draft.email))) {
    return 'Enter a valid email address.';
  }
  if (step === 3 && draft.password.length < 8) return 'Use at least 8 characters.';
  if (step === 3 && !draft.acceptedTerms) return 'Accept the terms and privacy policy to continue.';
  return null;
}

export function safeAccountDraft(draft: AccountDraft): SafeAccountDraft {
  return {
    fullName: draft.fullName,
    phone: draft.phone,
    email: normalizedEmail(draft.email),
  };
}

export function businessTaxDefaults(
  country: string,
  status: GstRegistrationStatus,
): { gstRegistrationStatus: GstRegistrationStatus; defaultTaxRate: number } {
  if (status !== 'registered') return { gstRegistrationStatus: status, defaultTaxRate: 0 };
  const rate = country === 'New Zealand' ? 15 : country === 'Australia' ? 10 : 0;
  return { gstRegistrationStatus: status, defaultTaxRate: rate };
}
