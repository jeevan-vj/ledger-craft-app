import React from 'react';
import { Feather } from '@expo/vector-icons';
import { StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '@/theme';
import { lightImpactHaptic } from '@/utils/haptics';
import { AppPressable } from './AppPressable';

interface Props { icon: React.ComponentProps<typeof Feather>['name']; label: string; onPress: () => void; primary?: boolean; style?: StyleProp<ViewStyle>; }
export function CircleIconButton({ icon, label, onPress, primary, style }: Props) {
  const theme = useTheme();
  return <AppPressable accessibilityRole="button" accessibilityLabel={label} hitSlop={6} onPress={() => { lightImpactHaptic(); onPress(); }} style={({ pressed }) => [{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: primary ? theme.colors.accent : theme.colors.surfaceRaised, borderWidth: primary ? 0 : 1, borderColor: theme.colors.border, opacity: pressed ? 0.75 : 1, transform: [{ scale: pressed ? 0.95 : 1 }] }, style]}><Feather name={icon} size={19} color={primary ? theme.colors.accentForeground : theme.colors.text} /></AppPressable>;
}
