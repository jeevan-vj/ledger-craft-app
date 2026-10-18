import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClientProvider } from '@tanstack/react-query';
import RootNavigator from './src/navigation';
import { appQueryClient, configureQueryLifecycle } from './src/lib/queryClient';
import './global.css';

export default function App() {
  useEffect(() => configureQueryLifecycle(), []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={appQueryClient}>
        <StatusBar style="auto" />
        <RootNavigator />
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
import { useEffect } from 'react';
