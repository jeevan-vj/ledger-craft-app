import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export const HOME_TASKS_DISMISSED_KEY = 'ledgercraft.home.tasks-dismissed.v1';
const DISMISSED = 'dismissed';

export const homeTaskStorage = {
  async isDismissed(): Promise<boolean> {
    try {
      if (Platform.OS === 'web') return globalThis.localStorage?.getItem(HOME_TASKS_DISMISSED_KEY) === DISMISSED;
      return (await SecureStore.getItemAsync(HOME_TASKS_DISMISSED_KEY)) === DISMISSED;
    } catch (error) {
      console.error('Error reading home task dismissal:', error);
      return false;
    }
  },
  async dismiss(): Promise<void> {
    if (Platform.OS === 'web') { globalThis.localStorage?.setItem(HOME_TASKS_DISMISSED_KEY, DISMISSED); return; }
    await SecureStore.setItemAsync(HOME_TASKS_DISMISSED_KEY, DISMISSED);
  },
};
