/**
 * Animation utilities for consistent micro-interactions.
 */

import { Easing } from 'react-native-reanimated';

// ============================================
// SPRING CONFIGURATIONS
// ============================================

/**
 * Spring physics configurations for different interaction types.
 * Using react-native-reanimated spring parameters.
 */
export const SPRING_CONFIG = {
  /** Gentle spring for subtle UI feedback */
  gentle: {
    damping: 15,
    stiffness: 120,
    mass: 1,
  },
  /** Snappy spring for buttons and quick interactions */
  snappy: {
    damping: 20,
    stiffness: 200,
    mass: 1,
  },
  /** Bouncy spring for emphasis and playful animations */
  bouncy: {
    damping: 10,
    stiffness: 180,
    mass: 1,
  },
  /** Smooth spring for card interactions */
  smooth: {
    damping: 18,
    stiffness: 150,
    mass: 1,
  },
} as const;

// ============================================
// TIMING CONFIGURATIONS
// ============================================

/**
 * Timing duration configurations in milliseconds.
 */
export const TIMING_CONFIG = {
  /** Fast interactions (quick feedback) */
  fast: 150,
  /** Normal transitions */
  normal: 250,
  /** Slow/emphasis animations */
  slow: 400,
  /** Very fast micro-interactions */
  instant: 100,
} as const;

/**
 * Easing functions for timing animations.
 */
export const EASING = {
  /** Standard ease-out for natural deceleration */
  easeOut: Easing.out(Easing.cubic),
  /** Ease-in-out for smooth transitions */
  easeInOut: Easing.inOut(Easing.cubic),
  /** Ease-in for acceleration */
  easeIn: Easing.in(Easing.cubic),
  /** Linear for consistent speed */
  linear: Easing.linear,
} as const;

// ============================================
// SCALE VALUES
// ============================================

/**
 * Scale values for press/touch feedback.
 * Subtle press scales.
 */
export const SCALE = {
  /** Button press scale (subtle) */
  pressed: 0.97,
  /** Card press scale (very subtle) */
  cardPressed: 0.98,
  /** Focus scale (slight expansion) */
  focus: 1.01,
  /** Active/selected scale */
  active: 1.02,
  /** Disabled scale */
  disabled: 0.95,
} as const;

// ============================================
// OPACITY VALUES
// ============================================

/**
 * Opacity values for various states.
 */
export const OPACITY = {
  /** Pressed state opacity */
  pressed: 0.8,
  /** Disabled state opacity */
  disabled: 0.5,
  /** Hover/focus state opacity */
  hover: 0.9,
  /** Full opacity */
  full: 1,
} as const;

// ============================================
// COLOR CONSTANTS
// ============================================

/**
 * Brand colors for animations.
 */
export const COLORS = {
  primary: '#9FE870',
  primaryDark: '#163300',
  secondary: '#163300',
  success: '#34C759',
  warning: '#FF9F0A',
  danger: '#FF3B30',
  border: 'rgba(22, 51, 0, 0.12)',
  borderFocus: '#163300',
  background: '#F2F2F2',
  surface: '#FFFFFF',
  text: '#163300',
  textSecondary: '#62605B',
} as const;

// ============================================
// SHADOW CONFIGURATIONS
// ============================================

/**
 * Shadow configurations for different states.
 */
export const SHADOWS = {
  none: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  pressed: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  button: {
    shadowColor: '#163300',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonPressed: {
    shadowColor: '#163300',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
} as const;

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get timing configuration with easing.
 */
export const getTimingConfig = (
  duration: keyof typeof TIMING_CONFIG = 'normal',
  easing: keyof typeof EASING = 'easeOut'
) => ({
  duration: TIMING_CONFIG[duration],
  easing: EASING[easing],
});

/**
 * Get spring configuration by name.
 */
export const getSpringConfig = (type: keyof typeof SPRING_CONFIG = 'snappy') =>
  SPRING_CONFIG[type];

/**
 * Interpolate between two shadow configurations.
 * Useful for animating shadows.
 */
export const interpolateShadow = (
  progress: number,
  from: typeof SHADOWS.md,
  to: typeof SHADOWS.pressed
) => ({
  shadowOpacity: from.shadowOpacity + (to.shadowOpacity - from.shadowOpacity) * progress,
  shadowRadius: from.shadowRadius + (to.shadowRadius - from.shadowRadius) * progress,
  elevation: from.elevation + (to.elevation - from.elevation) * progress,
});

