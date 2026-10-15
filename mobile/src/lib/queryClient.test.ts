import { appQueryClient, clearServerState } from './queryClient';

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
