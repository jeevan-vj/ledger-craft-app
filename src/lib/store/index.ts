/**
 * Modern State Management Architecture
 * Using Zustand for predictable state management
 */

import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

// Core store slices
import { createAuthSlice, AuthSlice } from './slices/authSlice';
import { createAppDataSlice, AppDataSlice } from './slices/appDataSlice';
import { createUISlice, UISlice } from './slices/uiSlice';

// Combined store type
export type RootStore = AuthSlice & AppDataSlice & UISlice;

// Create the store with middleware
export const useStore = create<RootStore>()(
  devtools(
    subscribeWithSelector(
      immer((...args) => ({
        ...createAuthSlice(...args),
        ...createAppDataSlice(...args),
        ...createUISlice(...args),
      }))
    ),
    {
      name: 'easybizinvoice-store',
    }
  )
);

// Selector hooks for performance optimization
export const useAuth = () => useStore((state) => ({
  user: state.user,
  session: state.session,
  loading: state.loading,
  hasCompletedOnboarding: state.hasCompletedOnboarding,
  onboardingChecked: state.onboardingChecked,
  signIn: state.signIn,
  signUp: state.signUp,
  signOut: state.signOut,
  signInWithGoogle: state.signInWithGoogle,
  checkOnboardingStatus: state.checkOnboardingStatus,
}));

export const useAppData = () => useStore((state) => ({
  customers: state.customers,
  invoices: state.invoices,
  businessProfile: state.businessProfile,
  items: state.items,
  // ... other data selectors
  loading: {
    customers: state.loadingCustomers,
    invoices: state.loadingInvoices,
    businessProfile: state.loadingBusinessProfile,
    items: state.loadingItems,
  },
  // Actions
  fetchCustomers: state.fetchCustomers,
  createCustomer: state.createCustomer,
  updateCustomer: state.updateCustomer,
  deleteCustomer: state.deleteCustomer,
  // ... other actions
}));

export const useUI = () => useStore((state) => ({
  theme: state.theme,
  sidebarOpen: state.sidebarOpen,
  notifications: state.notifications,
  setSidebarOpen: state.setSidebarOpen,
  addNotification: state.addNotification,
  removeNotification: state.removeNotification,
}));
