import { DefaultTheme, Theme } from '@react-navigation/native';
import { NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { Platform } from 'react-native';
import { motion, palette } from '@/theme/tokens';

export const COLORS = {
  accent: palette.accent,
  accentForeground: palette.accentForeground,
  background: palette.background,
  surface: palette.surface,
  text: palette.text,
  textSecondary: palette.textSecondary,
  border: palette.separator,
  danger: palette.danger,
  success: palette.success,
  warning: palette.warning,
} as const;

export const appNavigationTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: COLORS.accent,
    background: COLORS.background,
    card: COLORS.background,
    text: COLORS.text,
    border: 'transparent',
    notification: COLORS.danger,
  },
};

const iosGlassHeader =
  Platform.OS === 'ios'
    ? {}
    : {
        headerStyle: {
          backgroundColor: COLORS.background,
        },
      };

export const nativeHeaderOptions: NativeStackNavigationOptions = {
  headerShown: true,
  headerShadowVisible: false,
  headerBackTitle: 'Back',
  headerTintColor: COLORS.text,
  headerTitleStyle: {
    fontWeight: '600',
    color: COLORS.text,
  },
  headerLargeTitleStyle: {
    fontWeight: '700',
    color: COLORS.text,
  },
  ...iosGlassHeader,
  contentStyle: {
    backgroundColor: COLORS.background,
  },
  animation: 'slide_from_right',
  animationDuration: motion.standard,
  gestureEnabled: true,
  fullScreenGestureEnabled: Platform.OS === 'ios',
};

export const listHeaderOptions: NativeStackNavigationOptions = {
  ...nativeHeaderOptions,
  headerLargeTitle: true,
};

export const formHeaderOptions: NativeStackNavigationOptions = {
  ...nativeHeaderOptions,
  headerLargeTitle: false,
  presentation: Platform.OS === 'ios' ? 'modal' : 'card',
  animation: Platform.OS === 'ios' ? 'slide_from_bottom' : 'slide_from_right',
  gestureDirection: Platform.OS === 'ios' ? 'vertical' : 'horizontal',
};

export const detailHeaderOptions: NativeStackNavigationOptions = {
  ...nativeHeaderOptions,
  headerLargeTitle: false,
};
