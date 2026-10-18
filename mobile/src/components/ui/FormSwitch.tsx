import React from 'react';
import { View, Text, Switch, StyleSheet } from 'react-native';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme';

interface FormSwitchProps {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  description?: string;
}

export function FormSwitch({ label, value, onValueChange, description }: FormSwitchProps) {
  const theme = useTheme();
  const { colors: palette, type } = theme;
  const styles = createStyles(theme);
  return (
    <View style={styles.row}>
      <View style={styles.copy}>
        <Text style={styles.label}>{label}</Text>
        {description && (
          <Text style={styles.description}>{description}</Text>
        )}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: palette.fill, true: palette.accent }}
        thumbColor={value ? palette.accentForeground : palette.surface}
        ios_backgroundColor={palette.fill}
        accessibilityLabel={label}
        accessibilityHint={description}
      />
    </View>
  );
}

const createStyles = ({ colors: palette, type }: ReturnType<typeof useTheme>) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.md,
    marginBottom: space.sm,
  },
  copy: { flex: 1, paddingRight: space.lg },
  label: { ...type.subhead, color: palette.text, fontWeight: '600' },
  description: { ...type.caption, marginTop: 2 },
});
