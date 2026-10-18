import React from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { radius } from '@/theme/tokens';
import { useTheme } from '@/theme';

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
  const theme = useTheme();
  const { colors: palette, type } = theme;
  const styles = createStyles(theme);
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

const createStyles = ({ colors: palette, type }: ReturnType<typeof useTheme>) => StyleSheet.create({
  well: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.fill,
    borderRadius: radius.well,
  },
});
