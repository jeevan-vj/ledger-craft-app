import React, { useState } from 'react';
import { View, Text, TextInput, TextInputProps, StyleSheet } from 'react-native';
import { control, palette, radius, space, type } from '@/theme/tokens';

interface FormInputProps extends TextInputProps {
  label: string;
  error?: string;
  required?: boolean;
}

export function FormInput({
  label,
  error,
  required,
  style,
  onFocus,
  onBlur,
  ...props
}: FormInputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>
        {label} {required && <Text style={styles.required}>*</Text>}
      </Text>
      <TextInput
        style={[styles.input, focused && styles.focused, error ? styles.errorInput : null, style]}
        placeholderTextColor={palette.textTertiary}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        {...props}
      />
      {error && (
        <Text style={styles.error}>{error}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: space.lg },
  label: {
    ...type.footnote,
    color: palette.textSecondary,
    fontWeight: '500',
    marginBottom: 6,
  },
  required: { color: palette.danger },
  input: {
    minHeight: control.default,
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: radius.md,
    backgroundColor: palette.fillMuted,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    fontSize: 17,
    color: palette.text,
  },
  focused: {
    borderColor: palette.focus,
    backgroundColor: palette.surface,
  },
  errorInput: { borderColor: palette.danger },
  error: {
    ...type.caption,
    color: palette.danger,
    marginTop: 6,
  },
});
