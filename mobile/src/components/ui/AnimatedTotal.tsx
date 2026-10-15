import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  Easing,
} from 'react-native-reanimated';

interface AnimatedTotalProps {
  amount: number;
  currency?: string;
  size?: 'small' | 'medium' | 'large';
  showLabel?: boolean;
}

export function AnimatedTotal({
  amount,
  currency = 'NZD',
  size = 'medium',
  showLabel = false,
}: AnimatedTotalProps) {
  const animatedValue = useSharedValue(0);
  const scale = useSharedValue(1);

  useEffect(() => {
    // Animate the number counting up
    animatedValue.value = withTiming(amount, {
      duration: 600,
      easing: Easing.out(Easing.cubic),
    });

    // Scale animation for emphasis
    scale.value = withSpring(1.1, { damping: 10, stiffness: 200 });
    setTimeout(() => {
      scale.value = withSpring(1, { damping: 10, stiffness: 200 });
    }, 200);
  }, [amount]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  const formatCurrency = (value: number) => {
    const symbol = currency === 'NZD' ? '$' : currency;
    return `${symbol}${value.toFixed(2)}`;
  };

  const sizeStyles = {
    small: styles.small,
    medium: styles.medium,
    large: styles.large,
  };

  return (
    <View style={styles.container}>
      {showLabel && <Text style={styles.label}>Total</Text>}
      <Animated.View style={animatedStyle}>
        <Text style={[styles.amount, sizeStyles[size]]}>{formatCurrency(amount)}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'flex-end',
  },
  label: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '600',
  },
  amount: {
    fontWeight: '700',
    color: '#163300',
  },
  small: {
    fontSize: 16,
  },
  medium: {
    fontSize: 24,
  },
  large: {
    fontSize: 32,
  },
});


