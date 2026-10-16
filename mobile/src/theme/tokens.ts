import { Platform, StyleSheet } from 'react-native';

export const darkPalette = {
  background: '#121511', surface: '#1E211D', surfaceRaised: '#2A2D29',
  fill: '#292D28', fillMuted: '#242723', accent: '#9FE870', accentPressed: '#8FDC62',
  accentFill: '#1F3A13', accentForeground: '#163300', accentText: '#9FE870',
  text: '#F2F5EE', textSecondary: '#A3A89F', textTertiary: '#858B82',
  separator: 'rgba(242, 245, 238, 0.10)', border: 'rgba(242, 245, 238, 0.12)',
  danger: '#FF6B63', dangerFill: '#3B201F', success: '#9FE870', successFill: '#1F3A13',
  warning: '#FFB84D', warningFill: '#3B2F1B', info: '#7BA7FF', infoFill: '#1E2A40', focus: '#9FE870',
} as const;

export const lightPalette = {
  background: '#F5F6F3', surface: '#FFFFFF', surfaceRaised: '#FFFFFF',
  fill: '#EDEDED', fillMuted: '#F7F7F5', accent: '#9FE870', accentPressed: '#8FDC62',
  accentFill: '#E8F8D8', accentForeground: '#163300', accentText: '#315E13',
  text: '#163300', textSecondary: '#62605B', textTertiary: '#8A8880',
  separator: 'rgba(22, 51, 0, 0.12)', border: 'rgba(22, 51, 0, 0.14)',
  danger: '#D92D20', dangerFill: '#FFF2F1', success: '#2E7D32', successFill: '#ECF9EF',
  warning: '#B76000', warningFill: '#FFF7E8', info: '#2367D1', infoFill: '#EEF4FF', focus: '#4D7C0F',
} as const;

export type ThemePalette = typeof darkPalette | typeof lightPalette;

export const space = { none: 0, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, screen: 20, section: 32 } as const;
export const radius = { sm: 12, md: 16, lg: 20, xl: 24, group: 20, well: 24, pill: 999 } as const;
export const control = { compact: 36, default: 48, prominent: 56, touchTarget: Platform.OS === 'android' ? 48 : 44 } as const;
export const motion = { quick: 140, standard: 220, deliberate: 320, pressedScale: 0.97 } as const;

export function createTypography(colors: ThemePalette) {
  return {
    money: { fontSize: 46, fontWeight: '900' as const, letterSpacing: -1.7, lineHeight: 52, color: colors.text },
    display: { fontSize: 36, fontWeight: '900' as const, letterSpacing: -1.2, lineHeight: 42, color: colors.text },
    title: { fontSize: 28, fontWeight: '800' as const, letterSpacing: -0.6, color: colors.text },
    headline: { fontSize: 17, fontWeight: '700' as const, color: colors.text },
    body: { fontSize: 17, fontWeight: '400' as const, color: colors.text },
    callout: { fontSize: 16, fontWeight: '600' as const, color: colors.text },
    subhead: { fontSize: 15, fontWeight: '400' as const, color: colors.textSecondary },
    footnote: { fontSize: 13, fontWeight: '400' as const, color: colors.textSecondary },
    caption: { fontSize: 12, fontWeight: '600' as const, color: colors.textTertiary, letterSpacing: -0.08 },
    section: { fontSize: 13, fontWeight: '700' as const, color: colors.textSecondary, letterSpacing: 0.2 },
  };
}

export const hairline = StyleSheet.hairlineWidth;
export const groupedShadow = Platform.select({
  ios: { shadowColor: '#000000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.16, shadowRadius: 10 },
  android: { elevation: 1 }, default: {},
});
export const elevatedShadow = Platform.select({
  ios: { shadowColor: '#000000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.28, shadowRadius: 28 },
  android: { elevation: 5 }, default: {},
});
