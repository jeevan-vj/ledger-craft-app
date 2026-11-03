import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppPressable } from './AppPressable';
import { control, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme';

const ACTION_FONT_SIZE = 15;
const ACTION_PADDING_HORIZONTAL = 8;
const TITLE_FONT_SIZE = 17;
const GLYPH_WIDTH = 0.56;

export interface HeaderActionButtonProps {
  label: string;
  onPress: () => void;
  tone?: 'primary' | 'secondary';
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

function textWidth(label: string, fontSize: number, paddingHorizontal: number) {
  return Math.max(
    control.touchTarget,
    Math.ceil(label.length * fontSize * GLYPH_WIDTH) + paddingHorizontal * 2,
  );
}

/** Width budget for the header chrome at the default type size. */
export function headerActionClusterWidth(
  labels: string[],
  options?: { includeTitle?: boolean },
) {
  if (!options?.includeTitle) {
    return labels.reduce(
      (sum, label, index) =>
        sum + textWidth(label, ACTION_FONT_SIZE, ACTION_PADDING_HORIZONTAL) + (index > 0 ? space.sm : 0),
      0,
    );
  }
  const [cancel = '', title = '', ...actions] = labels;
  const cancelWidth = textWidth(cancel, TITLE_FONT_SIZE, 4);
  const titleWidth = Math.ceil(title.length * TITLE_FONT_SIZE * GLYPH_WIDTH);
  return space.xs * 2 + cancelWidth + titleWidth + space.xs * 2 + headerActionClusterWidth(actions);
}

export function HeaderActions({ children }: { children: React.ReactNode }) {
  return (
    <View
      testID="header-actions"
      accessibilityRole="toolbar"
      style={styles.row}
    >
      {children}
    </View>
  );
}

export function HeaderActionButton({
  label,
  onPress,
  tone = 'secondary',
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
}: HeaderActionButtonProps) {
  const { colors } = useTheme();
  const primary = tone === 'primary';
  return (
    <AppPressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      hitSlop={{ top: 6, bottom: 6, left: 0, right: 0 }}
      style={({ pressed }) => [
        styles.action,
        primary
          ? { backgroundColor: colors.accent }
          : {
              backgroundColor: colors.fill,
              borderWidth: 1,
              borderColor: colors.border,
            },
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text
        numberOfLines={1}
        style={[
          styles.actionLabel,
          { color: primary ? colors.accentForeground : colors.text },
          primary && styles.actionLabelPrimary,
        ]}
      >
        {label}
      </Text>
    </AppPressable>
  );
}

export function ScreenHeaderBar({
  title,
  left,
  right,
}: {
  title: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const paddingTop = Platform.OS === 'android' ? insets.top : space.xs;
  return (
    <View style={[styles.bar, { paddingTop, backgroundColor: colors.background }]}>
      <View style={styles.barRow}>
        <View style={styles.side}>{left}</View>
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.85}
          style={[styles.title, { color: colors.text }]}
        >
          {title}
        </Text>
        <View style={styles.side}>{right}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: space.sm,
    backgroundColor: 'transparent',
  },
  action: {
    minHeight: control.touchTarget,
    minWidth: control.touchTarget,
    flexShrink: 0,
    paddingHorizontal: ACTION_PADDING_HORIZONTAL,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: ACTION_FONT_SIZE,
    fontWeight: '600',
  },
  actionLabelPrimary: {
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.4,
  },
  bar: {
    paddingBottom: space.xs,
  },
  barRow: {
    minHeight: control.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.xs,
  },
  side: {
    flexGrow: 0,
    flexShrink: 0,
  },
  title: {
    flex: 1,
    flexShrink: 1,
    marginHorizontal: space.xs,
    textAlign: 'center',
    fontSize: TITLE_FONT_SIZE,
    fontWeight: '700',
  },
});
