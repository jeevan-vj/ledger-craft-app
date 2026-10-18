import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  TextInputProps,
  StyleSheet,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme';

interface ModernInputProps extends Omit<TextInputProps, 'onChange'> {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  error?: string;
  showPasswordToggle?: boolean;
}

export function ModernInput({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  error,
  autoCapitalize = 'none',
  keyboardType = 'default',
  showPasswordToggle = false,
  ...props
}: ModernInputProps) {
  const theme = useTheme();
  const { colors: palette, type } = theme;
  const styles = createStyles(theme);
  const [isFocused, setIsFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const inputType = showPasswordToggle ? !showPassword : !secureTextEntry;

  const triggerHaptic = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    }
  }, []);

  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View
        style={[
          styles.field,
          isFocused && styles.fieldFocused,
          error ? styles.fieldError : null,
        ]}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={palette.textTertiary}
          secureTextEntry={!inputType}
          autoCapitalize={autoCapitalize}
          keyboardType={keyboardType}
          onFocus={() => {
            setIsFocused(true);
            triggerHaptic();
          }}
          onBlur={() => setIsFocused(false)}
          style={styles.input}
          {...props}
        />
        {showPasswordToggle ? (
          <Pressable
            onPress={() => {
              setShowPassword((current) => !current);
              triggerHaptic();
            }}
            hitSlop={8}
            style={styles.passwordToggle}
          >
            <Feather
              name={showPassword ? 'eye-off' : 'eye'}
              size={18}
              color={palette.textSecondary}
            />
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const createStyles = ({ colors: palette, type }: ReturnType<typeof useTheme>) => StyleSheet.create({
  container: {
    marginBottom: space.lg,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: palette.textSecondary,
    marginBottom: 6,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.fillMuted,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
    minHeight: 48,
  },
  fieldFocused: {
    borderColor: palette.accent,
    backgroundColor: palette.surface,
  },
  fieldError: {
    borderColor: palette.danger,
  },
  input: {
    flex: 1,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    fontSize: 17,
    color: palette.text,
  },
  passwordToggle: {
    paddingHorizontal: space.md,
  },
  errorText: {
    color: palette.danger,
    fontSize: 12,
    marginTop: 6,
    fontWeight: '500',
  },
});

export default ModernInput;
