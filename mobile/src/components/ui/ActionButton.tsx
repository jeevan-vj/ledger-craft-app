import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  TouchableOpacityProps,
  StyleSheet,
} from 'react-native';
import { control, palette, radius, space } from '@/theme/tokens';

interface ActionButtonProps extends TouchableOpacityProps {
  title: string;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function ActionButton({ 
  title, 
  variant = 'primary', 
  loading = false, 
  size = 'md',
  disabled,
  style,
  ...props 
}: ActionButtonProps) {
  const variantStyles = {
    primary: styles.primary,
    secondary: styles.secondary,
    danger: styles.danger,
  };

  const textStyles = {
    primary: styles.primaryText,
    secondary: styles.secondaryText,
    danger: styles.dangerText,
  };

  const sizeStyles = {
    sm: styles.small,
    md: styles.medium,
    lg: styles.large,
  };

  const textSizeStyles = {
    sm: styles.smallText,
    md: styles.mediumText,
    lg: styles.largeText,
  };

  return (
    <TouchableOpacity
      style={[
        styles.base,
        variantStyles[variant],
        sizeStyles[size],
        (disabled || loading) && styles.disabled,
        style,
      ]}
      disabled={disabled || loading}
      activeOpacity={0.82}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: loading }}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'danger' ? '#FFFFFF' : palette.text} />
      ) : (
        <Text style={[styles.label, textStyles[variant], textSizeStyles[size]]}>
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
  },
  primary: { backgroundColor: palette.accent },
  secondary: { backgroundColor: palette.fill },
  danger: { backgroundColor: palette.danger },
  primaryText: { color: palette.accentForeground },
  secondaryText: { color: palette.text },
  dangerText: { color: '#FFFFFF' },
  small: { minHeight: control.compact, paddingHorizontal: space.lg },
  medium: { minHeight: control.default },
  large: { minHeight: control.prominent, paddingHorizontal: space.xxl },
  label: { fontWeight: '600', textAlign: 'center' },
  smallText: { fontSize: 14 },
  mediumText: { fontSize: 16 },
  largeText: { fontSize: 17 },
  disabled: { opacity: 0.45 },
});
