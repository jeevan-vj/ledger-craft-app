import { describe, expect, it } from 'vitest';
import { organisationNameAfterOnboarding } from './onboardingOrganisation';

describe('organisationNameAfterOnboarding', () => {
  it('replaces the personal placeholder with the business name', () => {
    expect(organisationNameAfterOnboarding("Harbour Books's organisation", 'Harbour Books', 'Harbour Books Ltd')).toBe('Harbour Books Ltd');
  });

  it('leaves a company the owner already named', () => {
    expect(organisationNameAfterOnboarding('Kauri Studio', 'Harbour Books', 'Harbour Books Ltd')).toBeNull();
  });
});
