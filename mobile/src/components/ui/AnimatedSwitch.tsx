/**
 * AnimatedSwitch - Revolut-Style Custom Toggle Switch
 * 
 * Features:
 * - Smooth thumb translation with spring physics
 * - Background color interpolation
 * - Scale feedback on press
 * - Haptic feedback
 * - Accessibility support
 */

import React, { useCallback, useEffect } from 'react';
import { StyleSheet, Platform, View, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolateColor,
  interpolate,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { SPRING_CONFIG, TIMING_CONFIG, SCALE, COLORS, EASING } from '@/utils/animations';

interface AnimatedSwitchProps {
  /** Current value of the switch */
  value: boolean;
  /** Callback when value changes */
  onValueChange: (value: boolean) => void;
  /** Whether the switch is disabled */
  disabled?: boolean;
  /** Label text (optional) */
  label?: string;
  /** Label position */
  labelPosition?: 'left' | 'right';
  /** Active track color */
  activeColor?: string;
  /** Inactive track color */
  inactiveColor?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Accessibility label */
  accessibilityLabel?: string;
}

// Size configurations
const SIZES = {
  sm: {
    trackWidth: 40,
    trackHeight: 24,
    thumbSize: 20,
    thumbOffset: 2,
  },
  md: {
    trackWidth: 50,
    trackHeight: 30,
    thumbSize: 26,
    thumbOffset: 2,
  },
  lg: {
    trackWidth: 60,
    trackHeight: 36,
    thumbSize: 32,
    thumbOffset: 2,
  },
};

export function AnimatedSwitch({
  value,
  onValueChange,
  disabled = false,
  label,
  labelPosition = 'left',
  activeColor = COLORS.primary,
  inactiveColor = '#E2E8F0',
  size = 'md',
  accessibilityLabel,
}: AnimatedSwitchProps) {
  const sizeConfig = SIZES[size];
  const thumbTravel = sizeConfig.trackWidth - sizeConfig.thumbSize - (sizeConfig.thumbOffset * 2);

  // Animation shared values
  const progress = useSharedValue(value ? 1 : 0);
  const pressed = useSharedValue(false);
  const thumbScale = useSharedValue(1);

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

  // Handle toggle
  const handleToggle = useCallback(() => {
    if (!disabled) {
      onValueChange(!value);
    }
  }, [disabled, onValueChange, value]);

  // Update animation when value changes
  useEffect(() => {
    progress.value = withSpring(value ? 1 : 0, SPRING_CONFIG.smooth);
  }, [value]);

  // Tap gesture
  const tapGesture = Gesture.Tap()
    .enabled(!disabled)
    .onBegin(() => {
      'worklet';
      pressed.value = true;
      thumbScale.value = withSpring(1.1, SPRING_CONFIG.snappy);
    })
    .onFinalize(() => {
      'worklet';
      pressed.value = false;
      thumbScale.value = withSpring(1, SPRING_CONFIG.snappy);
    })
    .onEnd(() => {
      'worklet';
      runOnJS(triggerHaptic)();
      runOnJS(handleToggle)();
    });

  // Animated track style
  const animatedTrackStyle = useAnimatedStyle(() => {
    'worklet';
    const backgroundColor = interpolateColor(
      progress.value,
      [0, 1],
      [inactiveColor, activeColor]
    );

    const scale = withSpring(
      pressed.value ? SCALE.pressed : 1,
      SPRING_CONFIG.snappy
    );

    return {
      backgroundColor,
      transform: [{ scale }],
    };
  });

  // Animated thumb style
  const animatedThumbStyle = useAnimatedStyle(() => {
    'worklet';
    const translateX = interpolate(
      progress.value,
      [0, 1],
      [0, thumbTravel]
    );

    // Slight horizontal stretch when moving
    const scaleX = interpolate(
      Math.abs(progress.value - 0.5) * 2,
      [0, 1],
      [1.1, 1]
    );

    return {
      transform: [
        { translateX },
        { scale: thumbScale.value },
        { scaleX },
      ],
    };
  });

  // Animated thumb shadow style
  const animatedThumbShadowStyle = useAnimatedStyle(() => {
    'worklet';
    const shadowOpacity = interpolate(
      pressed.value ? 1 : 0,
      [0, 1],
      [0.15, 0.25]
    );

    return {
      shadowOpacity,
    };
  });

  const switchComponent = (
    <GestureDetector gesture={tapGesture}>
      <Animated.View
        style={[
          styles.track,
          {
            width: sizeConfig.trackWidth,
            height: sizeConfig.trackHeight,
            borderRadius: sizeConfig.trackHeight / 2,
          },
          animatedTrackStyle,
          disabled && styles.disabled,
        ]}
        accessible={true}
        accessibilityRole="switch"
        accessibilityState={{ checked: value, disabled }}
        accessibilityLabel={accessibilityLabel || label}
      >
        <Animated.View
          style={[
            styles.thumb,
            {
              width: sizeConfig.thumbSize,
              height: sizeConfig.thumbSize,
              borderRadius: sizeConfig.thumbSize / 2,
              left: sizeConfig.thumbOffset,
              top: sizeConfig.thumbOffset,
            },
            animatedThumbStyle,
            animatedThumbShadowStyle,
          ]}
        />
      </Animated.View>
    </GestureDetector>
  );

  if (!label) {
    return switchComponent;
  }

  return (
    <View style={[
      styles.container,
      labelPosition === 'right' && styles.containerReverse,
    ]}>
      {labelPosition === 'left' && (
        <Text style={[styles.label, disabled && styles.labelDisabled]}>
          {label}
        </Text>
      )}
      {switchComponent}
      {labelPosition === 'right' && (
        <Text style={[styles.label, disabled && styles.labelDisabled]}>
          {label}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  containerReverse: {
    flexDirection: 'row-reverse',
    justifyContent: 'flex-end',
    gap: 12,
  },
  track: {
    justifyContent: 'center',
    position: 'relative',
  },
  thumb: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    fontSize: 16,
    color: COLORS.text,
    fontWeight: '500',
  },
  labelDisabled: {
    color: COLORS.textSecondary,
  },
});

export default AnimatedSwitch;

