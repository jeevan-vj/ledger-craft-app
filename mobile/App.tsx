import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClientProvider } from '@tanstack/react-query';
import RootNavigator from './src/navigation';
import { appQueryClient, configureQueryLifecycle } from './src/lib/queryClient';
import { ThemeProvider, useTheme } from './src/theme';
import './global.css';

function ThemedApp() {
  const theme = useTheme();
  useEffect(() => configureQueryLifecycle(), []);
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={appQueryClient}>
        <StatusBar style={theme.isDark ? 'light' : 'dark'} />
        <RootNavigator />
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

export default function App() {
  return <ThemeProvider><ThemedApp /></ThemeProvider>;
}
