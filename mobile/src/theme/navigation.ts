import { DarkTheme, DefaultTheme, Theme } from '@react-navigation/native';
import { NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { Platform } from 'react-native';
import { darkPalette, motion, type ThemePalette } from '@/theme/tokens';

export const COLORS = {
  accent: darkPalette.accent, accentForeground: darkPalette.accentForeground,
  background: darkPalette.background, surface: darkPalette.surface, text: darkPalette.text,
  textSecondary: darkPalette.textSecondary, border: darkPalette.separator,
  danger: darkPalette.danger, success: darkPalette.success, warning: darkPalette.warning,
} as const;

export function createNavigationTheme(colors: ThemePalette, isDark: boolean): Theme {
  const base = isDark ? DarkTheme : DefaultTheme;
  return { ...base, dark: isDark, colors: { ...base.colors, primary: colors.accent, background: colors.background, card: colors.surface, text: colors.text, border: colors.separator, notification: colors.danger } };
}

export function createHeaderOptions(colors: ThemePalette): NativeStackNavigationOptions {
  return {
    headerShown: true, headerShadowVisible: false, headerBackTitle: 'Back',
    headerTintColor: colors.text, headerStyle: { backgroundColor: colors.background },
    headerTitleStyle: { fontWeight: '700', color: colors.text },
    headerLargeTitleStyle: { fontWeight: '800', color: colors.text },
    contentStyle: { backgroundColor: colors.background }, animation: 'slide_from_right',
    animationDuration: motion.standard, gestureEnabled: true,
    fullScreenGestureEnabled: Platform.OS === 'ios',
  };
}

export function createListHeaderOptions(colors: ThemePalette): NativeStackNavigationOptions {
  return { ...createHeaderOptions(colors), headerLargeTitle: true };
}
export function createFormHeaderOptions(colors: ThemePalette): NativeStackNavigationOptions {
  return { ...createHeaderOptions(colors), headerLargeTitle: false, presentation: Platform.OS === 'ios' ? 'modal' : 'card', animation: Platform.OS === 'ios' ? 'slide_from_bottom' : 'slide_from_right', gestureDirection: Platform.OS === 'ios' ? 'vertical' : 'horizontal' };
}
export function createDetailHeaderOptions(colors: ThemePalette): NativeStackNavigationOptions {
  return { ...createHeaderOptions(colors), headerLargeTitle: false };
}

export const appNavigationTheme = createNavigationTheme(darkPalette, true);
export const nativeHeaderOptions = createHeaderOptions(darkPalette);
export const listHeaderOptions = createListHeaderOptions(darkPalette);
export const formHeaderOptions = createFormHeaderOptions(darkPalette);
export const detailHeaderOptions = createDetailHeaderOptions(darkPalette);
