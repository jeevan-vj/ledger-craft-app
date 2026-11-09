import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/context/ThemeContext';
import { GoogleSignInSection } from './GoogleSignInSection';
import ModernLogin from '@/pages/ModernLogin';
import ModernSignup from '@/pages/ModernSignup';

const getAuthProviders = vi.fn();
const startGoogleSignIn = vi.fn();
const toast = vi.fn();

vi.mock('@/features/auth/api/authApi', () => ({
  getAuthProviders: () => getAuthProviders(),
  startGoogleSignIn: (...args: unknown[]) => startGoogleSignIn(...args),
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
vi.mock('@/context/StableAuthContext', () => ({
  useAuth: () => ({ signIn: vi.fn(async () => ({ error: null })), signUp: vi.fn(async () => ({ error: null })) }),
}));

function renderSection(path = '/login') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <GoogleSignInSection errorPath={path.startsWith('/signup') ? '/signup' : '/login'} />
    </MemoryRouter>,
  );
}

describe('Google sign-in section', () => {
  beforeAll(() => {
    window.matchMedia = (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    });
  });

  beforeEach(() => {
    getAuthProviders.mockReset();
    startGoogleSignIn.mockReset();
    toast.mockReset();
  });

  it('hides the button when Google is disabled or the config request fails', async () => {
    getAuthProviders.mockResolvedValueOnce({ google: false });
    const hidden = renderSection();
    await waitFor(() => expect(getAuthProviders).toHaveBeenCalled());
    expect(hidden.queryByRole('button', { name: 'Continue with Google' })).toBeNull();
    hidden.unmount();

    getAuthProviders.mockRejectedValueOnce(new Error('offline'));
    const failed = renderSection();
    await waitFor(() => expect(getAuthProviders).toHaveBeenCalledTimes(2));
    expect(failed.queryByRole('button', { name: 'Continue with Google' })).toBeNull();
  });

  it('starts the redirect from sign-in and shows a disabled-provider error', async () => {
    getAuthProviders.mockResolvedValue({ google: true });
    startGoogleSignIn.mockRejectedValueOnce(new Error('Google sign-in is not available.'));
    renderSection('/login');
    const button = await screen.findByRole('button', { name: 'Continue with Google' });
    await userEvent.click(button);
    expect(startGoogleSignIn).toHaveBeenCalledWith(expect.objectContaining({
      errorCallbackURL: 'http://localhost:3000/login',
      newUserCallbackURL: 'http://localhost:3000/auth/callback?next=/onboarding',
    }));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      description: 'Google sign-in is not available.',
      variant: 'destructive',
    }));
  });

  it('shows the button on the sign-in and sign-up pages when Google is enabled', async () => {
    getAuthProviders.mockResolvedValue({ google: true });
    const login = render(
      <ThemeProvider>
        <MemoryRouter initialEntries={['/login']}>
          <ModernLogin />
        </MemoryRouter>
      </ThemeProvider>,
    );
    expect(await screen.findByRole('button', { name: 'Continue with Google' })).toBeTruthy();
    login.unmount();

    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={['/signup']}>
          <ModernSignup />
        </MemoryRouter>
      </ThemeProvider>,
    );
    expect(await screen.findByRole('button', { name: 'Continue with Google' })).toBeTruthy();
  });

  it('shows denied and cancelled callback errors on the sign-up page', async () => {
    getAuthProviders.mockResolvedValue({ google: false });
    const denied = renderSection('/signup?error=access_denied&error_description=The%20user%20denied%20the%20request');
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      description: 'Google sign-in was denied.',
    })));
    denied.unmount();
    toast.mockReset();

    renderSection('/signup?error=access_denied');
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      description: 'Google sign-in was cancelled.',
    })));
  });
});
