import React from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { palette, radius } from '@/theme/tokens';

interface IconWellProps {
  children: React.ReactNode;
  size?: number;
  primary?: boolean;
  color?: string;
  style?: ViewStyle;
}

export function IconWell({
  children,
  size = 40,
  primary = false,
  color,
  style,
}: IconWellProps) {
  return (
    <View
      style={[
        styles.well,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color ?? (primary ? palette.accent : palette.fill),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  well: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.fill,
    borderRadius: radius.well,
  },
});
