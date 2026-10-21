import * as SecureStore from 'expo-secure-store';

export const HOME_TASKS_DISMISSED_KEY = 'ledgercraft.home.tasks-dismissed.v1';
const DISMISSED = 'dismissed';

export const homeTaskStorage = {
  async isDismissed(): Promise<boolean> {
    try {
      return (await SecureStore.getItemAsync(HOME_TASKS_DISMISSED_KEY)) === DISMISSED;
    } catch (error) {
      console.error('Error reading home task dismissal:', error);
      return false;
    }
  },
  async dismiss(): Promise<void> {
    await SecureStore.setItemAsync(HOME_TASKS_DISMISSED_KEY, DISMISSED);
  },
};
