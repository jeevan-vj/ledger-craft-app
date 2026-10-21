import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { AppPressable } from './AppPressable';
import { control } from '@/theme/tokens';
import { useTheme } from '@/theme';

interface NativeHeaderButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
  destructive?: boolean;
  accessibilityHint?: string;
}

export function NativeHeaderButton({
  label,
  onPress,
  disabled = false,
  primary = false,
  destructive = false,
  accessibilityHint,
}: NativeHeaderButtonProps) {
  const { colors } = useTheme();
  const color = destructive
    ? colors.danger
    : primary
      ? colors.accentText
      : colors.text;

  return (
    <AppPressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.button,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text
        style={[
          styles.label,
          { color },
          primary && styles.primary,
        ]}
      >
        {label}
      </Text>
    </AppPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: control.touchTarget,
    minWidth: control.touchTarget,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  pressed: {
    opacity: 0.6,
  },
  disabled: {
    opacity: 0.4,
  },
  label: {
    fontSize: 17,
    fontWeight: '500',
  },
  primary: {
    fontWeight: '700',
  },
});
