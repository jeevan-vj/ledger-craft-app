import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { onboardingStorage } from './onboardingStorage';

it('retains safe signup contact details through Expo web business setup without using native SecureStore', async () => {
  const previous = Platform.OS;
  Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } });
  try {
    const draft = { fullName: 'Aroha', email: 'aroha@example.test', phone: '+64210000001' };
    await onboardingStorage.saveAccountDraft(draft);
    expect(await onboardingStorage.loadAccountDraft()).toEqual(draft);
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    await onboardingStorage.markIntroSeen();
    expect(await onboardingStorage.hasSeenIntro()).toBe(true);
    await onboardingStorage.clearAccountDraft();
    expect(await onboardingStorage.loadAccountDraft()).toBeNull();
  } finally { Object.defineProperty(Platform, 'OS', { value: previous, configurable: true }); }
});
