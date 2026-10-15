import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { COLORS } from '@/theme/navigation';

interface NativeHeaderButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
  destructive?: boolean;
}

export function NativeHeaderButton({
  label,
  onPress,
  disabled = false,
  primary = false,
  destructive = false,
}: NativeHeaderButtonProps) {
  const color = destructive
    ? COLORS.danger
    : COLORS.text;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
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
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 44,
    minWidth: 44,
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
