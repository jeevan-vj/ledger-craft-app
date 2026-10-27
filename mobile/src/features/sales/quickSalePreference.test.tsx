import React from 'react';
import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { QuickSaleSwitch } from './QuickSaleSwitch';
import { resetQuickSalePreferenceForTests, useQuickSaleEnabled } from './quickSalePreference';

const memory = new Map<string, string>();

describe('quick sale switch', () => {
  beforeEach(() => {
    memory.clear();
    resetQuickSalePreferenceForTests();
    (SecureStore.getItemAsync as jest.Mock).mockImplementation(async (key: string) => memory.get(key) ?? null);
    (SecureStore.setItemAsync as jest.Mock).mockImplementation(async (key: string, value: string) => {
      memory.set(key, value);
    });
    (SecureStore.deleteItemAsync as jest.Mock).mockImplementation(async (key: string) => {
      memory.delete(key);
    });
  });

  it('stays off by default and stores the device switch', async () => {
    const first = renderHook(() => useQuickSaleEnabled());
    await waitFor(() => expect(first.result.current.ready).toBe(true));
    expect(first.result.current.enabled).toBe(false);

    const screen = render(<QuickSaleSwitch />);
    await waitFor(() => expect(screen.getByLabelText('Quick sale').props.value).toBe(false));
    await act(async () => {
      fireEvent(screen.getByLabelText('Quick sale'), 'valueChange', true);
    });
    expect(memory.get('ledgercraft.quickSale.enabled')).toBe('1');
    expect(first.result.current.enabled).toBe(true);

    await act(async () => {
      first.result.current.setEnabled(false);
    });
    expect(memory.has('ledgercraft.quickSale.enabled')).toBe(false);
    expect(screen.getByLabelText('Quick sale').props.value).toBe(false);
  });
});
