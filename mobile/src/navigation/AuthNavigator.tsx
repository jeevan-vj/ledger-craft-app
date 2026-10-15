/**
 * Auth Navigator - Authentication Flow Navigation
 * 
 * Features:
 * - Smooth fade transitions between auth screens
 * - Slide animation for onboarding flow
 * - Gesture-enabled navigation
 */

import React, { useMemo } from 'react';
import { Platform } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthStackParamList } from './types';
import { useAuth } from '@/store';
import LoginScreen from '@/screens/auth/LoginScreen';
import SignupScreen from '@/screens/auth/SignupScreen';
import OnboardingScreen from '@/screens/auth/OnboardingScreen';

// Animation configurations
import {
  authScreenOptions,
  onboardingScreenOptions,
} from '@/utils/navigationAnimations';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export default function AuthNavigator() {
  const { user, hasCompletedOnboarding } = useAuth();

  // Determine initial route - memoize to prevent recalculation
  const initialRoute = useMemo(() => {
    if (user && !hasCompletedOnboarding) {
      return 'Onboarding';
    }
    return 'Login';
  }, [user, hasCompletedOnboarding]);

  return (
    <Stack.Navigator
      initialRouteName={initialRoute}
      screenOptions={{
        headerShown: false,
        // Smooth fade for auth transitions
        animation: 'fade',
        animationDuration: 250,
        gestureEnabled: true,
        fullScreenGestureEnabled: Platform.OS === 'ios',
      }}
    >
      <Stack.Screen
        name="Login"
        component={LoginScreen}
        options={{
          ...authScreenOptions,
          // Fade in for login screen
          animation: 'fade',
          animationDuration: 250,
        }}
      />
      <Stack.Screen
        name="Signup"
        component={SignupScreen}
        options={{
          ...authScreenOptions,
          // Slide from right for signup (feels like progression)
          animation: 'slide_from_right',
          animationDuration: 300,
          gestureEnabled: true,
        }}
      />
      <Stack.Screen
        name="Onboarding"
        component={OnboardingScreen}
        options={{
          ...onboardingScreenOptions,
          // Slide from bottom for onboarding (feels like new journey)
          animation: Platform.OS === 'ios' ? 'slide_from_bottom' : 'slide_from_right',
          animationDuration: 350,
          gestureDirection: Platform.OS === 'ios' ? 'vertical' : 'horizontal',
        }}
      />
    </Stack.Navigator>
  );
}
