import React, { useCallback } from 'react';
import {
  Text,
  ActivityIndicator,
  View,
  StyleSheet,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { SPRING_CONFIG, SCALE, OPACITY } from '@/utils/animations';
import { palette, radius } from '@/theme/tokens';

interface ModernButtonProps {
  onPress: () => void;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  style?: object;
}

export function ModernButton({
  onPress,
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  icon,
  iconPosition = 'left',
  style,
}: ModernButtonProps) {
  const isDisabled = disabled || loading;
  const pressed = useSharedValue(false);

  const triggerHaptic = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    }
  }, []);

  const handlePress = useCallback(() => {
    if (!isDisabled) {
      onPress();
    }
  }, [isDisabled, onPress]);

  const tapGesture = Gesture.Tap()
    .enabled(!isDisabled)
    .onBegin(() => {
      'worklet';
      pressed.value = true;
    })
    .onFinalize(() => {
      'worklet';
      pressed.value = false;
    })
    .onEnd(() => {
      'worklet';
      runOnJS(triggerHaptic)();
      runOnJS(handlePress)();
    });

  const animatedScaleStyle = useAnimatedStyle(() => {
    'worklet';
    const scale = withSpring(pressed.value ? SCALE.pressed : 1, SPRING_CONFIG.snappy);
    return {
      transform: [{ scale }],
    };
  });

  const padding = {
    sm: { paddingHorizontal: 14, height: 36 },
    md: { paddingHorizontal: 20, height: 52 },
    lg: { paddingHorizontal: 24, height: 56 },
  };

  return (
    <GestureDetector gesture={tapGesture}>
      <Animated.View
        accessible
        accessibilityRole="button"
        accessibilityState={{ disabled: isDisabled, busy: loading }}
        style={[
          styles.button,
          variant === 'primary' && styles.primary,
          variant === 'secondary' && styles.secondary,
          variant === 'outline' && styles.outline,
          variant === 'ghost' && styles.ghost,
          fullWidth && styles.fullWidth,
          isDisabled && styles.disabled,
          animatedScaleStyle,
          style,
        ]}
      >
        <View style={[styles.buttonContent, padding[size], fullWidth && styles.fullWidth]}>
          {loading ? (
            <ActivityIndicator
              size="small"
              color={variant === 'primary' ? palette.accentForeground : palette.text}
              style={{ marginRight: 8 }}
            />
          ) : null}
          {!loading && icon && iconPosition === 'left' ? (
            <View style={{ marginRight: 8 }}>{icon}</View>
          ) : null}
          <Text
            style={[
              styles.buttonText,
              variant === 'primary' ? styles.primaryText : styles.secondaryText,
              size === 'lg' && { fontSize: 17 },
            ]}
          >
            {children}
          </Text>
          {!loading && icon && iconPosition === 'right' ? (
            <View style={{ marginLeft: 8 }}>{icon}</View>
          ) : null}
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontWeight: '600',
    textAlign: 'center',
    fontSize: 16,
  },
  primary: {
    backgroundColor: palette.accent,
  },
  primaryText: {
    color: palette.accentForeground,
  },
  secondary: {
    backgroundColor: palette.fill,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: palette.separator,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  secondaryText: {
    color: palette.text,
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: OPACITY.disabled,
  },
});

export default ModernButton;
