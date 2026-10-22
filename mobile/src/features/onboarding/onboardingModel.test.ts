import {
  accountStepError,
  businessTaxDefaults,
  safeAccountDraft,
  type AccountDraft,
} from './onboardingModel';

const validDraft: AccountDraft = {
  fullName: 'Jeevan Wijerathna',
  phone: '+64 21 555 0101',
  email: 'owner@example.com',
  password: 'password123',
  acceptedTerms: true,
};

describe('onboarding model', () => {
  it('validates each progressive account step', () => {
    expect(accountStepError(0, { ...validDraft, fullName: 'J' })).toBeTruthy();
    expect(accountStepError(1, validDraft)).toBeNull();
    expect(accountStepError(2, { ...validDraft, email: 'not-an-email' })).toBeTruthy();
    expect(accountStepError(3, { ...validDraft, password: 'short' })).toBeTruthy();
    expect(accountStepError(3, { ...validDraft, acceptedTerms: false })).toBeTruthy();
    expect(accountStepError(3, validDraft)).toBeNull();
  });

  it('never includes the password in a persisted account draft', () => {
    expect(safeAccountDraft(validDraft)).toEqual({
      fullName: validDraft.fullName,
      phone: validDraft.phone,
      email: validDraft.email,
    });
    expect(safeAccountDraft(validDraft)).not.toHaveProperty('password');
  });

  it('uses exact GST defaults without inferring registration from the rate', () => {
    expect(businessTaxDefaults('New Zealand', 'registered')).toEqual({
      gstRegistrationStatus: 'registered',
      defaultTaxRate: 15,
    });
    expect(businessTaxDefaults('New Zealand', 'not_registered')).toEqual({
      gstRegistrationStatus: 'not_registered',
      defaultTaxRate: 0,
    });
  });
});
