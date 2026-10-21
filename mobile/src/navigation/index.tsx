/**
 * Root Navigator - Application Entry Point
 * 
 * Features:
 * - Smooth fade transition between Auth and Main stacks
 * - Loading state with animated indicator
 * - Automatic auth state handling
 */

import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  Easing,
} from 'react-native-reanimated';
import { RootStackParamList } from './types';
import { useAuth, useStore } from '@/store';
import AuthNavigator from './AuthNavigator';
import AppNavigator from './AppNavigator';
import { createNavigationTheme } from '@/theme/navigation';
import { useTheme } from '@/theme';
import { rootNavigatorOptions } from '@/utils/navigationAnimations';
import { mobileLinking } from './links';
import { registerNavigationContainer, setSentryUser } from '@/observability/sentry';
import PublicInvoiceScreen from '@/screens/invoices/PublicInvoiceScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

// Animated loading component
function AnimatedLoadingScreen() {
  const theme = useTheme();
  const opacity = useSharedValue(0.4);
  const scale = useSharedValue(0.95);

  useEffect(() => {
    // Pulsing animation
    opacity.value = withRepeat(
      withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    scale.value = withRepeat(
      withTiming(1.05, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <View style={[styles.loadingContainer, { backgroundColor: theme.colors.background }]}>
      <Animated.View style={[styles.logoContainer, animatedStyle]}>
        <View style={[styles.logo, { backgroundColor: theme.colors.accent }]}>
          <Animated.Text style={[styles.logoText, { color: theme.colors.accentForeground }]}>LC</Animated.Text>
        </View>
      </Animated.View>
      <ActivityIndicator
        size="large"
        color={theme.colors.accent}
        style={styles.activityIndicator}
      />
    </View>
  );
}

export default function RootNavigator() {
  const theme = useTheme();
  const navigationRef = useNavigationContainerRef<RootStackParamList>();
  const { user, loading, hasCompletedOnboarding, onboardingChecked } = useAuth();

  useEffect(() => {
    // Initialize auth state on mount
    const { initialize } = useStore.getState();
    initialize().catch((error) => {
      console.error('[RootNavigator] Failed to initialize auth', error);
    });
  }, []);

  useEffect(() => {
    setSentryUser(user?.id ?? null);
  }, [user?.id]);

  // Show animated loading screen while checking auth
  if (loading || !onboardingChecked) {
    return <AnimatedLoadingScreen />;
  }

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={createNavigationTheme(theme.colors, theme.isDark)}
      linking={mobileLinking}
      onReady={() => {
        registerNavigationContainer(navigationRef);
      }}
    >
      <Stack.Navigator
        initialRouteName={user && hasCompletedOnboarding ? 'Main' : 'Auth'}
        screenOptions={{
          ...rootNavigatorOptions,
          // Smooth fade between Auth and Main stacks
          animation: 'fade',
          animationDuration: 400,
          gestureEnabled: false,
        }}
      >
        <Stack.Screen
          name="PublicInvoice"
          component={PublicInvoiceScreen}
          options={{ headerShown: false, animation: 'slide_from_right' }}
        />
        {!user ? (
          <Stack.Screen
            name="Auth"
            component={AuthNavigator}
            options={{
              animation: 'fade',
              animationDuration: 300,
            }}
          />
        ) : !hasCompletedOnboarding ? (
          // Redirect to onboarding within auth stack
          <Stack.Screen
            name="Auth"
            component={AuthNavigator}
            options={{
              animation: 'fade',
              animationDuration: 300,
            }}
          />
        ) : (
          <Stack.Screen
            name="Main"
            component={AppNavigator}
            options={{
              // Elegant fade-in for main app
              animation: 'fade',
              animationDuration: 400,
            }}
          />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: {
    marginBottom: 32,
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    fontSize: 28,
    fontWeight: '700',
  },
  activityIndicator: {
    marginTop: 16,
  },
});
