import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { AppPressable } from '@/components/ui/AppPressable';
import {
  PRESET_THEME_CHOICES,
  PRESET_THEMES,
  THEME_COLOR_FIELDS,
  isHexColor,
  previewTheme,
  themeFieldError,
  themesMatch,
  type BusinessTheme,
} from '@/features/business-profile/theme';
import { useTheme } from '@/theme';
import { control, hairline, radius, space } from '@/theme/tokens';

interface ThemeEditorProps {
  value: BusinessTheme;
  onChange: (theme: BusinessTheme) => void;
  status?: { tone: 'success' | 'error'; message: string } | null;
}

export function ThemeEditor({ value, onChange, status }: ThemeEditorProps) {
  const theme = useTheme();
  const { colors: palette, type } = theme;
  const styles = createStyles(theme);
  const preview = previewTheme(value);

  return (
    <View style={styles.wrap}>
      <Text style={type.headline}>Invoice theme</Text>
      <Text style={[type.subhead, styles.intro]}>
        Choose a preset or set your own colours. Invoices use this palette.
      </Text>

      <View
        accessible
        accessibilityLabel="Invoice theme preview"
        style={[styles.previewFrame, { backgroundColor: preview.background }]}
      >
        <View
          accessible
          accessibilityLabel="Theme preview header"
          style={[styles.previewHeader, { backgroundColor: preview.primary }]}
        >
          <View style={[styles.previewSecondary, { backgroundColor: preview.secondary }]} />
        </View>
        <View style={[styles.previewBody, { backgroundColor: preview.surface }]}>
          <View style={styles.previewCopy}>
            <Text style={[type.callout, { color: preview.text }]}>Invoice 001</Text>
            <Text style={[type.footnote, { color: preview.textLight }]}>Due on receipt</Text>
          </View>
          <View style={[styles.previewAccent, { backgroundColor: preview.accent }]} />
        </View>
      </View>

      <Text style={styles.section}>Presets</Text>
      <View style={styles.grid}>
        {PRESET_THEME_CHOICES.map((choice) => {
          const preset = PRESET_THEMES[choice.key];
          const selected = themesMatch(value, preset);
          return (
            <AppPressable
              key={choice.key}
              accessibilityRole="button"
              accessibilityLabel={`${choice.label} theme`}
              accessibilityState={{ selected }}
              onPress={() => onChange(preset)}
              style={({ pressed }) => [
                styles.preset,
                {
                  backgroundColor: palette.surface,
                  borderColor: selected ? palette.accent : palette.border,
                  opacity: pressed ? 0.78 : 1,
                  transform: [{ scale: pressed ? theme.motion.pressedScale : 1 }],
                },
              ]}
            >
              <View style={[styles.presetSwatch, { backgroundColor: preset.primary }]}>
                <View style={[styles.presetSecondary, { backgroundColor: preset.secondary }]} />
              </View>
              <Text style={[type.footnote, styles.presetLabel, { color: palette.text }]}>{choice.label}</Text>
              {selected ? (
                <View style={[styles.check, { backgroundColor: palette.accent }]}>
                  <Feather name="check" size={12} color={palette.accentForeground} />
                </View>
              ) : null}
            </AppPressable>
          );
        })}
      </View>

      <Text style={styles.section}>Custom colours</Text>
      <Text style={[type.footnote, styles.helper]}>Use a hex colour such as #3B82F6.</Text>
      {THEME_COLOR_FIELDS.map((field) => {
        const colour = value[field.key];
        const error = themeFieldError(colour);
        const valid = isHexColor(colour);
        return (
          <View key={field.key} style={styles.field}>
            <Text style={styles.fieldLabel}>{field.label}</Text>
            <View style={styles.fieldRow}>
              <View
                accessible
                accessibilityLabel={`${field.label} swatch`}
                style={[
                  styles.swatch,
                  {
                    backgroundColor: valid ? colour.trim() : palette.fillMuted,
                    borderColor: valid ? palette.separator : palette.danger,
                  },
                ]}
              />
              <TextInput
                accessibilityLabel={`${field.label} colour`}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={7}
                placeholder="#3B82F6"
                placeholderTextColor={palette.textTertiary}
                value={colour}
                onChangeText={(next) => onChange({ ...value, [field.key]: next })}
                style={[
                  styles.input,
                  {
                    color: palette.text,
                    backgroundColor: palette.fillMuted,
                    borderColor: error ? palette.danger : 'transparent',
                  },
                ]}
              />
            </View>
            {error ? (
              <Text accessibilityLiveRegion="polite" style={styles.error}>
                {error}
              </Text>
            ) : null}
          </View>
        );
      })}

      {status ? (
        <Text
          accessibilityLiveRegion="assertive"
          style={[styles.status, { color: status.tone === 'error' ? palette.danger : palette.accentText }]}
        >
          {status.message}
        </Text>
      ) : null}
    </View>
  );
}

const createStyles = ({ colors: palette, type }: ReturnType<typeof useTheme>) => StyleSheet.create({
  wrap: {
    gap: space.md,
  },
  intro: {
    marginTop: -space.xs,
  },
  previewFrame: {
    borderRadius: radius.group,
    padding: space.sm,
    borderWidth: hairline,
    borderColor: palette.separator,
  },
  previewHeader: {
    height: 36,
    borderTopLeftRadius: radius.sm,
    borderTopRightRadius: radius.sm,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  previewSecondary: {
    height: 6,
  },
  previewBody: {
    minHeight: 72,
    borderBottomLeftRadius: radius.sm,
    borderBottomRightRadius: radius.sm,
    padding: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  previewCopy: {
    flex: 1,
    gap: space.xs,
  },
  previewAccent: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
  },
  section: {
    ...type.section,
    marginTop: space.sm,
    marginLeft: space.xs,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: space.md,
  },
  preset: {
    width: '48%',
    minHeight: control.default,
    borderRadius: radius.md,
    borderWidth: 2,
    padding: space.sm,
    gap: space.sm,
  },
  presetSwatch: {
    height: 28,
    borderRadius: radius.sm,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  presetSecondary: {
    height: 6,
  },
  presetLabel: {
    fontWeight: '600',
  },
  check: {
    position: 'absolute',
    top: space.sm,
    right: space.sm,
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helper: {
    marginTop: -space.xs,
    marginLeft: space.xs,
  },
  field: {
    gap: space.xs,
  },
  fieldLabel: {
    ...type.footnote,
    color: palette.textSecondary,
    fontWeight: '600',
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  swatch: {
    width: control.default,
    height: control.default,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  input: {
    flex: 1,
    minHeight: control.default,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    fontSize: 17,
  },
  error: {
    ...type.caption,
    color: palette.danger,
  },
  status: {
    ...type.subhead,
    fontWeight: '600',
  },
});
