import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import { AppState, type AppStateStatus } from 'react-native';

export const appQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

export function clearServerState() {
  appQueryClient.clear();
}

export function syncQueryFocus(status: AppStateStatus) {
  focusManager.setFocused(status === 'active');
}

export function syncQueryOnline(state: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>) {
  onlineManager.setOnline(state.isConnected === true && state.isInternetReachable !== false);
}

export function configureQueryLifecycle() {
  syncQueryFocus(AppState.currentState);
  const appStateSubscription = AppState.addEventListener('change', syncQueryFocus);
  const unsubscribeNetwork = NetInfo.addEventListener(syncQueryOnline);

  return () => {
    appStateSubscription.remove();
    unsubscribeNetwork();
  };
}
