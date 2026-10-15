/**
 * Navigation Animations - Revolut-Style Screen Transitions
 * 
 * Provides smooth, professional screen transition animations
 * inspired by Revolut's iOS app.
 */

import { NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { StackCardInterpolationProps, StackCardStyleInterpolator } from '@react-navigation/stack';
import { Animated, Easing, Platform } from 'react-native';

// ============================================
// TIMING CONFIGURATIONS
// ============================================

const ANIMATION_DURATION = {
  fast: 250,
  normal: 350,
  slow: 450,
};

// ============================================
// NATIVE STACK SCREEN OPTIONS
// ============================================

/**
 * Default screen options with smooth iOS-style slide animation.
 * Uses native animations for best performance.
 */
export const defaultScreenOptions: NativeStackNavigationOptions = {
  headerShown: true,
  animation: 'slide_from_right',
  animationDuration: ANIMATION_DURATION.fast,
  gestureEnabled: true,
  gestureDirection: 'horizontal',
  fullScreenGestureEnabled: true,
  customAnimationOnGesture: true,
  presentation: 'card',
};

/**
 * Modal presentation with slide from bottom.
 * Perfect for forms, pickers, and detail screens.
 */
export const modalScreenOptions: NativeStackNavigationOptions = {
  headerShown: true,
  animation: 'slide_from_bottom',
  animationDuration: ANIMATION_DURATION.normal,
  gestureEnabled: true,
  gestureDirection: 'vertical',
  presentation: 'modal',
  // iOS-specific for modal
  ...(Platform.OS === 'ios' && {
    sheetAllowedDetents: 'all',
    sheetGrabberVisible: true,
    sheetCornerRadius: 24,
  }),
};

/**
 * Fade animation for subtle transitions.
 * Good for tab switches and auth transitions.
 */
export const fadeScreenOptions: NativeStackNavigationOptions = {
  headerShown: false, // auth screens keep a custom brand surface
  animation: 'fade',
  animationDuration: ANIMATION_DURATION.fast,
  gestureEnabled: false,
  presentation: 'card',
};

/**
 * Fade from bottom - combines fade with subtle upward movement.
 * Great for detail screens and overlays.
 */
export const fadeFromBottomOptions: NativeStackNavigationOptions = {
  headerShown: false,
  animation: 'fade_from_bottom',
  animationDuration: ANIMATION_DURATION.normal,
  gestureEnabled: true,
  gestureDirection: 'vertical',
  presentation: 'card',
};

/**
 * iOS-style form sheet presentation.
 * Shows as a card on iOS, modal on Android.
 */
export const formSheetOptions: NativeStackNavigationOptions = {
  headerShown: false,
  presentation: 'formSheet',
  animation: 'slide_from_bottom',
  animationDuration: ANIMATION_DURATION.normal,
  gestureEnabled: true,
  ...(Platform.OS === 'ios' && {
    sheetAllowedDetents: [0.5, 0.75, 1],
    sheetLargestUndimmedDetent: 'medium',
    sheetGrabberVisible: true,
    sheetCornerRadius: 24,
  }),
};

/**
 * Transparent modal for overlays and pickers.
 */
export const transparentModalOptions: NativeStackNavigationOptions = {
  headerShown: false,
  presentation: 'transparentModal',
  animation: 'fade',
  animationDuration: ANIMATION_DURATION.fast,
  gestureEnabled: false,
  contentStyle: {
    backgroundColor: 'transparent',
  },
};

/**
 * No animation - instant transition.
 * Use sparingly for special cases.
 */
export const noAnimationOptions: NativeStackNavigationOptions = {
  headerShown: false,
  animation: 'none',
  gestureEnabled: false,
};

// ============================================
// SCREEN-SPECIFIC PRESETS
// ============================================

/**
 * Preset for list screens (main screens).
 */
export const listScreenOptions: NativeStackNavigationOptions = {
  ...defaultScreenOptions,
  animation: 'slide_from_right',
};

/**
 * Preset for detail screens.
 */
export const detailScreenOptions: NativeStackNavigationOptions = {
  ...defaultScreenOptions,
  animation: 'slide_from_right',
  animationDuration: ANIMATION_DURATION.normal,
};

/**
 * Preset for create/edit form screens.
 */
export const formScreenOptions: NativeStackNavigationOptions = {
  ...defaultScreenOptions,
  animation: Platform.OS === 'ios' ? 'slide_from_bottom' : 'slide_from_right',
  animationDuration: ANIMATION_DURATION.normal,
  gestureDirection: Platform.OS === 'ios' ? 'vertical' : 'horizontal',
};

/**
 * Preset for settings screens.
 */
export const settingsScreenOptions: NativeStackNavigationOptions = {
  ...defaultScreenOptions,
  animation: 'slide_from_right',
};

/**
 * Preset for auth screens (login, signup).
 */
export const authScreenOptions: NativeStackNavigationOptions = {
  ...fadeScreenOptions,
  animationDuration: ANIMATION_DURATION.fast,
};

/**
 * Preset for onboarding screens.
 */
export const onboardingScreenOptions: NativeStackNavigationOptions = {
  headerShown: false,
  animation: 'slide_from_right',
  animationDuration: ANIMATION_DURATION.normal,
  gestureEnabled: true,
};

// ============================================
// ROOT NAVIGATOR OPTIONS
// ============================================

/**
 * Options for root navigator transitions (Auth <-> Main).
 */
export const rootNavigatorOptions: NativeStackNavigationOptions = {
  headerShown: false,
  animation: 'fade',
  animationDuration: ANIMATION_DURATION.normal,
  gestureEnabled: false,
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get screen options based on screen type.
 */
export function getScreenOptions(
  type: 'list' | 'detail' | 'form' | 'modal' | 'settings' | 'auth' | 'onboarding'
): NativeStackNavigationOptions {
  switch (type) {
    case 'list':
      return listScreenOptions;
    case 'detail':
      return detailScreenOptions;
    case 'form':
      return formScreenOptions;
    case 'modal':
      return modalScreenOptions;
    case 'settings':
      return settingsScreenOptions;
    case 'auth':
      return authScreenOptions;
    case 'onboarding':
      return onboardingScreenOptions;
    default:
      return defaultScreenOptions;
  }
}

/**
 * Create custom animation config.
 */
export function createAnimationConfig(
  animation: NativeStackNavigationOptions['animation'] = 'slide_from_right',
  duration: number = ANIMATION_DURATION.normal
): NativeStackNavigationOptions {
  return {
    headerShown: false,
    animation,
    animationDuration: duration,
    gestureEnabled: true,
  };
}

