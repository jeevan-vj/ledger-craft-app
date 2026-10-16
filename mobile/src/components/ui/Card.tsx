import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { useTheme } from '@/theme';

export function Card({ children, elevated = false, style }: { children: React.ReactNode; elevated?: boolean; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return <View style={[{ backgroundColor: elevated ? theme.colors.surfaceRaised : theme.colors.surface, borderRadius: theme.radius.xl, padding: theme.space.xl, borderWidth: 1, borderColor: theme.colors.border }, style]}>{children}</View>;
}
