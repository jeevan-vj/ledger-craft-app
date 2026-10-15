import React, { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { create } from 'zustand';
import { AuthSlice, createAuthSlice } from '@/store/authSlice';

// Mock store factory
export const createMockStore = (initialState: Partial<AuthSlice> = {}) => {
  return create<AuthSlice>()((set, get) => ({
    ...createAuthSlice(set, get),
    ...initialState,
  }));
};

// Custom render function with providers
interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  initialAuthState?: Partial<AuthSlice>;
  navigationConfig?: any;
}

export function renderWithProviders(
  ui: ReactElement,
  {
    initialAuthState = {},
    navigationConfig = {},
    ...renderOptions
  }: CustomRenderOptions = {}
) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <NavigationContainer {...navigationConfig}>
        {children}
      </NavigationContainer>
    );
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
  };
}

// Re-export everything from React Native Testing Library
export * from '@testing-library/react-native';
export { renderWithProviders as render };

