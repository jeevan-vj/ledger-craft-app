import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AppPressable } from './AppPressable';
import { control, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  actionVariant?: 'button' | 'link';
  onAction?: () => void;
}

export function EmptyState({ icon, title, description, actionLabel, actionVariant = 'button', onAction }: EmptyStateProps) {
  const theme = useTheme();
  const { colors: palette, type } = theme;
  const styles = createStyles(theme);
  return (
    <View style={styles.wrap}>
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
      {actionLabel && onAction ? (
        <AppPressable
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          style={({ pressed }) => [styles.button, actionVariant === 'link' && styles.link, pressed && styles.pressed]}
        >
          <Text style={[styles.buttonLabel, actionVariant === 'link' && styles.linkLabel]}>{actionLabel}</Text>
        </AppPressable>
      ) : null}
    </View>
  );
}

const createStyles = ({ colors: palette, type }: ReturnType<typeof useTheme>) => StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xxl,
    paddingVertical: 40,
  },
  icon: {
    marginBottom: space.md,
  },
  title: {
    ...type.headline,
    textAlign: 'center',
  },
  description: {
    ...type.subhead,
    textAlign: 'center',
    marginTop: 6,
    maxWidth: 280,
  },
  button: {
    marginTop: space.lg,
    backgroundColor: palette.accent,
    paddingHorizontal: 20,
    minHeight: control.touchTarget,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
  buttonLabel: {
    color: palette.accentForeground,
    fontSize: 16,
    fontWeight: '600',
  },
  link: {
    backgroundColor: 'transparent',
  },
  linkLabel: {
    color: palette.accentText,
  },
});
