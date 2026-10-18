import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/theme';

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
  accessibilityHint?: string;
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
  accessibilityHint,
}: ListRowProps) {
  const theme = useTheme();
  const colors = theme.colors;
  const spokenValue = value ?? placeholder;
  const content = (
    <View style={[styles.row, { backgroundColor: colors.surface }, disabled && styles.disabled]}>
      {icon ? <View style={[styles.icon, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>{icon}</View> : null}
      <View style={styles.copy}>
        <Text
          style={[theme.type.body, styles.label, destructive && { color: colors.danger }]}
          numberOfLines={1}
        >
          {label}
        </Text>
        {subtitle ? (
          <Text style={[theme.type.footnote, styles.subtitle]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {accessory}
      {value ? (
        <Text style={[theme.type.body, styles.value, { color: colors.textSecondary }]} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {!value && placeholder ? (
        <Text style={[theme.type.body, styles.placeholder, { color: colors.textTertiary }]} numberOfLines={1}>
          {placeholder}
        </Text>
      ) : null}
      {onPress && showChevron && !destructive ? (
        <Feather name="chevron-right" size={18} color={colors.textTertiary} />
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
      accessibilityLabel={spokenValue ? `${label}, ${spokenValue}` : label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      style={({ pressed }) => pressed && { backgroundColor: colors.fillMuted }}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 68,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  disabled: {
    opacity: 0.45,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontWeight: '600',
  },
  destructive: {
    textAlign: 'center',
    width: '100%',
  },
  subtitle: {
    marginTop: 1,
    lineHeight: 18,
  },
  value: {
    maxWidth: '46%',
    textAlign: 'right',
  },
  placeholder: {
    maxWidth: '46%',
    textAlign: 'right',
  },
});
