import { supabase } from '@/services/supabaseClient';

export const TEST_USER = {
  email: process.env.E2E_TEST_EMAIL || process.env.EXPO_PUBLIC_TEST_EMAIL || 'test@ledgercraft.com',
  password: process.env.E2E_TEST_PASSWORD || process.env.EXPO_PUBLIC_TEST_PASSWORD || 'Test123!@#',
  userId: '',
};

export const getAuthenticatedSupabaseClient = async () => supabase;

export const cleanupTestData = {
  async deleteCustomers(_client: typeof supabase, _prefix = 'TEST_') {},
  async deleteItems(_client: typeof supabase, _prefix = 'TEST_') {},
  async deleteInvoices(_client: typeof supabase, _prefix = 'TEST_INV_') {},
  async deleteBusinessProfile(_client: typeof supabase, _userId: string) {},
  async cleanAll(_client: typeof supabase) {},
};

export const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  replace: jest.fn(),
  push: jest.fn(),
  pop: jest.fn(),
  popToTop: jest.fn(),
  reset: jest.fn(),
  setParams: jest.fn(),
  dispatch: jest.fn(),
  isFocused: jest.fn(() => true),
  canGoBack: jest.fn(() => true),
  getId: jest.fn(() => 'test-screen'),
  getState: jest.fn(() => ({})),
  getParent: jest.fn(),
  addListener: jest.fn(() => () => {}),
  removeListener: jest.fn(),
};

export const mockRoute = {
  key: 'test-route',
  name: 'TestScreen',
  params: {},
};
