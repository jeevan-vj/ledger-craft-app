import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { space } from '@/theme/tokens';
import { IconWell } from './IconWell';
import { useTheme } from '@/theme';

interface QuickActionProps {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  primary?: boolean;
}

export function QuickAction({ icon, label, onPress, primary = false }: QuickActionProps) {
  const theme = useTheme();
  const { colors: palette, type } = theme;
  const styles = createStyles(theme);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
    >
      <IconWell size={56} primary={primary}>
        {icon}
      </IconWell>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const createStyles = ({ colors: palette, type }: ReturnType<typeof useTheme>) => StyleSheet.create({
  wrap: {
    alignItems: 'center',
    minWidth: 72,
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.97 }],
  },
  label: {
    ...type.caption,
    color: palette.text,
    fontWeight: '600',
    marginTop: space.sm,
  },
});
