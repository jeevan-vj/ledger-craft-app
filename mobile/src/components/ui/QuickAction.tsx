import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { space } from '@/theme/tokens';
import { lightImpactHaptic } from '@/utils/haptics';
import { IconWell } from './IconWell';
import { AppPressable } from './AppPressable';
import { useTheme } from '@/theme';

interface QuickActionProps {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  primary?: boolean;
  accessibilityHint?: string;
}

export function QuickAction({ icon, label, onPress, primary = false, accessibilityHint }: QuickActionProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  return (
    <AppPressable
      onPress={() => {
        lightImpactHaptic();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
    >
      <IconWell size={theme.control.prominent} primary={primary}>
        {icon}
      </IconWell>
      <Text style={styles.label} numberOfLines={2}>{label}</Text>
    </AppPressable>
  );
}

const createStyles = ({ colors: palette, type, control: controlTokens }: ReturnType<typeof useTheme>) => StyleSheet.create({
  wrap: {
    flexGrow: 0,
    flexShrink: 1,
    flexBasis: '25%',
    maxWidth: '25%',
    alignItems: 'center',
    minWidth: controlTokens.touchTarget,
    minHeight: controlTokens.touchTarget,
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
    textAlign: 'center',
  },
});
