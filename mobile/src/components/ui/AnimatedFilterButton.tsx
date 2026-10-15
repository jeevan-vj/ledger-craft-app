/**
 * AnimatedFilterButton - Revolut-Style Animated Filter/Tab Button
 * 
 * Features:
 * - Smooth background color interpolation
 * - Scale animation on active state
 * - Press feedback animation
 * - Haptic feedback
 */

import React, { useCallback, useEffect } from 'react';
import { Text, StyleSheet, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  interpolateColor,
  interpolate,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { SPRING_CONFIG, TIMING_CONFIG, SCALE, EASING } from '@/utils/animations';

interface AnimatedFilterButtonProps {
  /** Label text for the button */
  label: string;
  /** Whether this filter is currently active */
  active: boolean;
  /** Callback when pressed */
  onPress: () => void;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Active background color */
  activeBackgroundColor?: string;
  /** Inactive background color */
  inactiveBackgroundColor?: string;
  /** Active text color */
  activeTextColor?: string;
  /** Inactive text color */
  inactiveTextColor?: string;
  /** Variant for different contexts */
  variant?: 'light' | 'dark';
}

export function AnimatedFilterButton({
  label,
  active,
  onPress,
  disabled = false,
  activeBackgroundColor,
  inactiveBackgroundColor,
  activeTextColor,
  inactiveTextColor,
  variant = 'dark',
}: AnimatedFilterButtonProps) {
  // Default colors based on variant
  const colors = {
    light: {
      activeBg: activeBackgroundColor || '#163300',
      inactiveBg: inactiveBackgroundColor || '#F1F5F9',
      activeText: activeTextColor || '#FFFFFF',
      inactiveText: inactiveTextColor || '#64748B',
    },
    dark: {
      activeBg: activeBackgroundColor || '#FFFFFF',
      inactiveBg: inactiveBackgroundColor || 'rgba(255, 255, 255, 0.15)',
      activeText: activeTextColor || '#1E2875',
      inactiveText: inactiveTextColor || 'rgba(255, 255, 255, 0.8)',
    },
  };

  const currentColors = colors[variant];

  // Animation shared values
  const progress = useSharedValue(active ? 1 : 0);
  const pressed = useSharedValue(false);

  // Trigger haptic feedback
  const triggerHaptic = useCallback(() => {
    if (Platform.OS !== 'web') {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch (error) {
        // Haptic feedback not available
      }
    }
  }, []);

  // Handle press
  const handlePress = useCallback(() => {
    if (!disabled) {
      onPress();
    }
  }, [disabled, onPress]);

  // Update animation when active state changes
  useEffect(() => {
    progress.value = withTiming(active ? 1 : 0, {
      duration: TIMING_CONFIG.normal,
      easing: EASING.easeOut,
    });
  }, [active]);

  // Tap gesture
  const tapGesture = Gesture.Tap()
    .enabled(!disabled)
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

  // Animated container style
  const animatedContainerStyle = useAnimatedStyle(() => {
    'worklet';
    const backgroundColor = interpolateColor(
      progress.value,
      [0, 1],
      [currentColors.inactiveBg, currentColors.activeBg]
    );

    // Scale up slightly when active, scale down when pressed
    const baseScale = interpolate(progress.value, [0, 1], [1, SCALE.active]);
    const pressScale = withSpring(
      pressed.value ? SCALE.pressed : 1,
      SPRING_CONFIG.snappy
    );
    const scale = baseScale * pressScale;

    // Border color animation
    const borderColor = interpolateColor(
      progress.value,
      [0, 1],
      [
        variant === 'dark' ? 'rgba(255, 255, 255, 0.2)' : '#E2E8F0',
        variant === 'dark' ? '#FFFFFF' : currentColors.activeBg,
      ]
    );

    return {
      backgroundColor,
      transform: [{ scale }],
      borderColor,
    };
  });

  // Animated text style
  const animatedTextStyle = useAnimatedStyle(() => {
    'worklet';
    const color = interpolateColor(
      progress.value,
      [0, 1],
      [currentColors.inactiveText, currentColors.activeText]
    );

    return {
      color,
    };
  });

  return (
    <GestureDetector gesture={tapGesture}>
      <Animated.View
        style={[
          styles.container,
          animatedContainerStyle,
          disabled && styles.disabled,
        ]}
      >
        <Animated.Text style={[styles.label, animatedTextStyle]}>
          {label}
        </Animated.Text>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.5,
  },
});

export default AnimatedFilterButton;

