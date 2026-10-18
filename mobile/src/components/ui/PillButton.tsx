import React from 'react';
import { ActivityIndicator, Pressable, StyleProp, Text, ViewStyle } from 'react-native';
import { lightImpactHaptic } from '@/utils/haptics';
import { useTheme } from '@/theme';

interface PillButtonProps {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  icon?: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function PillButton({ label, onPress, variant = 'primary', icon, disabled, loading, style }: PillButtonProps) {
  const theme = useTheme();
  const colors = theme.colors;
  const backgroundColor = variant === 'primary' ? colors.accent : variant === 'secondary' ? colors.accentFill : 'transparent';
  const color = variant === 'primary' ? colors.accentForeground : variant === 'secondary' ? colors.accentText : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      disabled={disabled || loading}
      onPress={() => { lightImpactHaptic(); onPress?.(); }}
      style={({ pressed }) => [{
        minHeight: theme.control.touchTarget,
        paddingHorizontal: theme.space.xl,
        borderRadius: theme.radius.pill,
        backgroundColor,
        borderWidth: variant === 'ghost' ? 1 : 0,
        borderColor: colors.border,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.space.sm,
        opacity: disabled ? 0.42 : pressed ? 0.78 : 1,
        transform: [{ scale: pressed ? theme.motion.pressedScale : 1 }],
      }, style]}
    >
      {loading ? <ActivityIndicator color={color} /> : <>{icon}<Text style={{ color, fontSize: 15, fontWeight: '800' }}>{label}</Text></>}
    </Pressable>
  );
}
