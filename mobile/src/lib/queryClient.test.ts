import { focusManager, onlineManager } from '@tanstack/react-query';
import { appQueryClient, clearServerState, syncQueryFocus, syncQueryOnline } from './queryClient';

describe('query client session isolation', () => {
  afterEach(() => {
    appQueryClient.clear();
  });

  it('removes cached organisation data when the session ends', () => {
    appQueryClient.setQueryData(['purchases', 'bills'], [{ id: 'bill-from-user-a' }]);

    clearServerState();

    expect(appQueryClient.getQueryData(['purchases', 'bills'])).toBeUndefined();
  });
});

describe('React Native query lifecycle', () => {
  it('maps app activity to query focus', () => {
    const spy = jest.spyOn(focusManager, 'setFocused');
    syncQueryFocus('active');
    syncQueryFocus('background');
    expect(spy).toHaveBeenNthCalledWith(1, true);
    expect(spy).toHaveBeenNthCalledWith(2, false);
    spy.mockRestore();
  });

  it('requires both a network connection and reachable internet', () => {
    const spy = jest.spyOn(onlineManager, 'setOnline');
    syncQueryOnline({ isConnected: true, isInternetReachable: true });
    syncQueryOnline({ isConnected: true, isInternetReachable: false });
    expect(spy).toHaveBeenNthCalledWith(1, true);
    expect(spy).toHaveBeenNthCalledWith(2, false);
    spy.mockRestore();
  });
});
