import { Platform, StyleSheet } from 'react-native';

export const palette = {
  background: '#F5F6F3',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  fill: '#EDEDED',
  fillMuted: '#F7F7F5',
  accent: '#9FE870',
  accentPressed: '#8FDC62',
  accentFill: '#E8F8D8',
  accentForeground: '#163300',
  text: '#163300',
  textSecondary: '#62605B',
  textTertiary: '#8A8880',
  separator: 'rgba(22, 51, 0, 0.12)',
  danger: '#FF3B30',
  dangerFill: '#FFF2F1',
  success: '#34C759',
  successFill: '#ECF9EF',
  warning: '#FF9F0A',
  warningFill: '#FFF7E8',
  info: '#3478F6',
  infoFill: '#EEF4FF',
  focus: '#4D7C0F',
} as const;

export const space = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  screen: 20,
  section: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  group: 16,
  well: 28,
  pill: 980,
} as const;

export const control = {
  compact: 36,
  default: 48,
  prominent: 56,
  touchTarget: Platform.OS === 'android' ? 48 : 44,
} as const;

export const motion = {
  quick: 140,
  standard: 220,
  deliberate: 320,
  pressedScale: 0.98,
} as const;

export const type = {
  money: {
    fontSize: 44,
    fontWeight: '700' as const,
    letterSpacing: -1.4,
    lineHeight: 50,
    color: palette.text,
  },
  title: {
    fontSize: 28,
    fontWeight: '700' as const,
    letterSpacing: -0.4,
    color: palette.text,
  },
  headline: {
    fontSize: 17,
    fontWeight: '600' as const,
    color: palette.text,
  },
  body: {
    fontSize: 17,
    fontWeight: '400' as const,
    color: palette.text,
  },
  callout: {
    fontSize: 16,
    fontWeight: '500' as const,
    color: palette.text,
  },
  subhead: {
    fontSize: 15,
    fontWeight: '400' as const,
    color: palette.textSecondary,
  },
  footnote: {
    fontSize: 13,
    fontWeight: '400' as const,
    color: palette.textSecondary,
  },
  caption: {
    fontSize: 12,
    fontWeight: '500' as const,
    color: palette.textTertiary,
    letterSpacing: -0.08,
  },
  section: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: palette.textSecondary,
    letterSpacing: -0.08,
    textTransform: 'uppercase' as const,
  },
};

export const hairline = StyleSheet.hairlineWidth;

export const groupedShadow = Platform.select({
  ios: {
    shadowColor: '#163300',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
  },
  android: {
    elevation: 0,
  },
  default: {},
});

export const elevatedShadow = Platform.select({
  ios: {
    shadowColor: palette.text,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
  },
  android: {
    elevation: 4,
  },
  default: {},
});
