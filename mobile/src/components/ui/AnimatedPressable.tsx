/**
 * AnimatedPressable - Revolut-Style Press Animation Component
 * 
 * A reusable animated wrapper for any pressable element with:
 * - Scale animation on press (0.97 default)
 * - Optional haptic feedback
 * - Spring physics for natural feel
 * - Accessibility support
 */

import React, { useCallback } from 'react';
import { StyleProp, ViewStyle, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { SPRING_CONFIG, SCALE, OPACITY } from '@/utils/animations';

interface AnimatedPressableProps {
  /** Content to render inside the pressable */
  children: React.ReactNode;
  /** Callback when pressed */
  onPress?: () => void;
  /** Callback when long pressed */
  onLongPress?: () => void;
  /** Scale value when pressed (default: 0.97) */
  scale?: number;
  /** Enable haptic feedback on press (default: true) */
  haptic?: boolean;
  /** Haptic feedback style */
  hapticStyle?: Haptics.ImpactFeedbackStyle;
  /** Whether the pressable is disabled */
  disabled?: boolean;
  /** Custom style for the container */
  style?: StyleProp<ViewStyle>;
  /** Additional animated style */
  animatedContainerStyle?: StyleProp<ViewStyle>;
  /** Whether to animate opacity as well (default: false) */
  animateOpacity?: boolean;
  /** Accessibility label */
  accessibilityLabel?: string;
  /** Accessibility hint */
  accessibilityHint?: string;
  /** Test ID for testing */
  testID?: string;
}

export function AnimatedPressable({
  children,
  onPress,
  onLongPress,
  scale = SCALE.pressed,
  haptic = true,
  hapticStyle = Haptics.ImpactFeedbackStyle.Light,
  disabled = false,
  style,
  animatedContainerStyle,
  animateOpacity = false,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: AnimatedPressableProps) {
  // Shared values for animations
  const pressed = useSharedValue(false);
  const isLongPress = useSharedValue(false);

  // Trigger haptic feedback
  const triggerHaptic = useCallback(() => {
    if (haptic && Platform.OS !== 'web') {
      try {
        Haptics.impactAsync(hapticStyle);
      } catch (error) {
        // Haptic feedback not available
      }
    }
  }, [haptic, hapticStyle]);

  // Handle press callback
  const handlePress = useCallback(() => {
    if (!disabled && onPress) {
      onPress();
    }
  }, [disabled, onPress]);

  // Handle long press callback
  const handleLongPress = useCallback(() => {
    if (!disabled && onLongPress) {
      onLongPress();
    }
  }, [disabled, onLongPress]);

  // Tap gesture for press
  const tapGesture = Gesture.Tap()
    .enabled(!disabled)
    .onBegin(() => {
      'worklet';
      pressed.value = true;
      isLongPress.value = false;
    })
    .onFinalize(() => {
      'worklet';
      pressed.value = false;
    })
    .onEnd(() => {
      'worklet';
      if (!isLongPress.value) {
        runOnJS(triggerHaptic)();
        runOnJS(handlePress)();
      }
    });

  // Long press gesture
  const longPressGesture = Gesture.LongPress()
    .enabled(!disabled && !!onLongPress)
    .minDuration(500)
    .onStart(() => {
      'worklet';
      isLongPress.value = true;
      runOnJS(triggerHaptic)();
      runOnJS(handleLongPress)();
    })
    .onFinalize(() => {
      'worklet';
      pressed.value = false;
    });

  // Combine gestures
  const composedGesture = Gesture.Race(longPressGesture, tapGesture);

  // Animated style for scale and opacity
  const animatedStyle = useAnimatedStyle(() => {
    'worklet';
    const scaleValue = withSpring(
      pressed.value ? scale : 1,
      SPRING_CONFIG.snappy
    );

    const opacityValue = animateOpacity
      ? withSpring(
          pressed.value ? OPACITY.pressed : OPACITY.full,
          SPRING_CONFIG.snappy
        )
      : 1;

    return {
      transform: [{ scale: scaleValue }],
      opacity: disabled ? OPACITY.disabled : opacityValue,
    };
  }, [scale, disabled, animateOpacity]);

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View
        style={[style, animatedStyle, animatedContainerStyle]}
        accessible={true}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled }}
        testID={testID}
      >
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

/**
 * AnimatedPressableCard - Variant with card-specific scale
 * 
 * Slightly less scale reduction for larger card elements.
 */
export function AnimatedPressableCard({
  scale = SCALE.cardPressed,
  ...props
}: AnimatedPressableProps) {
  return <AnimatedPressable scale={scale} {...props} />;
}

export default AnimatedPressable;

