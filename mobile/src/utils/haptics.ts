import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

function run(feedback: Promise<void>) {
  if (Platform.OS === 'web') return;
  feedback.catch(() => undefined);
}

export function selectionHaptic() {
  if (Platform.OS === 'web') return;
  run(Haptics.selectionAsync());
}

export function lightImpactHaptic() {
  if (Platform.OS === 'web') return;
  run(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

export function successHaptic() {
  if (Platform.OS === 'web') return;
  run(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

export function errorHaptic() {
  if (Platform.OS === 'web') return;
  run(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
}
