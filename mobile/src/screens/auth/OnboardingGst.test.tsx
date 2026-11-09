import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import OnboardingScreen from './OnboardingScreen';
import { onboardingStorage } from '@/features/onboarding/onboardingStorage';
import { businessProfileService } from '@/services/businessProfileService';
const mockCompleted = jest.fn();
jest.mock('@/store', () => ({ useAuth: () => ({ user: { email: 'owner@example.test' }, setOnboardingStatus: mockCompleted }) }));
jest.mock('@/features/onboarding/onboardingStorage', () => ({ onboardingStorage: { loadAccountDraft: jest.fn(), loadBusinessDraft: jest.fn(), saveBusinessDraft: jest.fn(), clearAccountDraft: jest.fn(), clearBusinessDraft: jest.fn() } }));
jest.mock('@/services/businessProfileService', () => ({ businessProfileService: { createBusinessProfile: jest.fn() } }));
beforeEach(() => { jest.clearAllMocks(); jest.mocked(onboardingStorage.loadAccountDraft).mockResolvedValue(null); jest.mocked(onboardingStorage.loadBusinessDraft).mockResolvedValue({ step: 2, businessName: 'Kauri Studio', country: 'New Zealand', gstRegistrationStatus: 'registered' }); jest.mocked(businessProfileService.createBusinessProfile).mockResolvedValue({ id: 'b' } as never); });
it('requires the declared registration date and valid GST number when onboarding an NZ registered business', async () => {
 const s = render(<OnboardingScreen />); await s.findByText('Yes, calculate GST'); await waitFor(() => expect(s.getByRole('radio', { name: 'Yes, calculate GST' })).toHaveProp('accessibilityState', { selected: true }));
 fireEvent.press(s.getByText('Finish setup')); expect(await s.findByText('Enter a valid NZ GST number and registration date before finishing setup.')).toBeTruthy(); expect(businessProfileService.createBusinessProfile).not.toHaveBeenCalled();
 fireEvent.changeText(s.getByLabelText('NZ GST number'), '49-091-850'); fireEvent.changeText(s.getByLabelText('GST registered from'), '2026-04-01'); fireEvent.press(s.getByText('Finish setup'));
 expect(await s.findByText('Choose the accounting basis, filing frequency and period-ending month IRD confirmed.')).toBeTruthy();
 expect(businessProfileService.createBusinessProfile).not.toHaveBeenCalled();
 expect(s.getByText(/payments basis, two-monthly filing, and a period ending in March are common/i)).toBeTruthy();
 fireEvent.press(s.getByLabelText('Payments basis')); fireEvent.press(s.getByLabelText('Two-monthly')); fireEvent.press(s.getByLabelText('Period ending March')); fireEvent.press(s.getByText('Finish setup'));
 await waitFor(() => expect(businessProfileService.createBusinessProfile).toHaveBeenCalledWith(expect.objectContaining({ gstRegistrationStatus: 'registered', taxId: '49091850', gstRegisteredFrom: '2026-04-01', gstAccountingBasis: 'payments', gstFilingFrequency: 'two_monthly', gstPeriodAnchor: 3 })));
 expect(mockCompleted).toHaveBeenCalledWith(true, true);
});

it('does not ask a non-registered business for IRD filing settings', async () => {
 jest.mocked(onboardingStorage.loadBusinessDraft).mockResolvedValue({ step: 2, businessName: 'Kauri Studio', country: 'New Zealand', gstRegistrationStatus: 'not_registered' });
 const s = render(<OnboardingScreen />);
 await s.findByText('No, I’m not registered');
 expect(s.queryByLabelText('Payments basis')).toBeNull();
 fireEvent.press(s.getByText('Finish setup'));
 await waitFor(() => expect(businessProfileService.createBusinessProfile).toHaveBeenCalled());
 expect(jest.mocked(businessProfileService.createBusinessProfile).mock.calls[0][0]).not.toEqual(expect.objectContaining({ gstAccountingBasis: expect.anything() }));
});
