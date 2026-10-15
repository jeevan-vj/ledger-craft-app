import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { palette, space, type } from '@/theme/tokens';

interface ListRowProps {
  label: string;
  value?: string;
  subtitle?: string;
  placeholder?: string;
  icon?: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  destructive?: boolean;
  showChevron?: boolean;
  accessory?: React.ReactNode;
}

export function ListRow({
  label,
  value,
  subtitle,
  placeholder,
  icon,
  onPress,
  disabled = false,
  destructive = false,
  showChevron = true,
  accessory,
}: ListRowProps) {
  const content = (
    <View style={[styles.row, disabled && styles.disabled]}>
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <View style={styles.copy}>
        <Text
          style={[styles.label, destructive && styles.destructive]}
          numberOfLines={1}
        >
          {label}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {accessory}
      {value ? (
        <Text style={styles.value} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {!value && placeholder ? (
        <Text style={styles.placeholder} numberOfLines={1}>
          {placeholder}
        </Text>
      ) : null}
      {onPress && showChevron && !destructive ? (
        <Feather name="chevron-right" size={18} color={palette.textTertiary} />
      ) : null}
    </View>
  );

  if (!onPress || disabled) {
    return content;
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => pressed && styles.pressed}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 52,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: palette.surface,
  },
  pressed: {
    backgroundColor: palette.fillMuted,
  },
  disabled: {
    opacity: 0.45,
  },
  icon: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.accentFill,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    ...type.body,
  },
  destructive: {
    color: palette.danger,
    textAlign: 'center',
    width: '100%',
  },
  subtitle: {
    ...type.footnote,
    marginTop: 1,
  },
  value: {
    ...type.body,
    color: palette.textSecondary,
    maxWidth: '46%',
    textAlign: 'right',
  },
  placeholder: {
    ...type.body,
    color: palette.textTertiary,
    maxWidth: '46%',
    textAlign: 'right',
  },
});
