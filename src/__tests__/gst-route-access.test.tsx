import React, { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, type RouteObject } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
vi.mock('@/lib/sentry/init', () => ({ initSentry: async () => undefined, createSentryBrowserRouter: (routes: RouteObject[]) => ({ routes }) }));
vi.mock('@/components/layout/AppLayout', () => ({ AppLayout: () => null }));
vi.mock('@/routes/quotePages', () => ({ CreateQuote: () => null, EditQuote: () => null, QuoteViewPage: () => null, Quotes: () => null, SharedQuote: () => null }));
vi.mock('@/context/StableAuthContext', () => ({ AuthProvider: () => null, useAuth: () => ({ user: { id: 'reader' }, me: { membership: { role: 'read_only' }, permissions: ['reports.read', 'settings.read'] } }) }));
import { router } from '@/routes';
function find(routes: RouteObject[], path: string): RouteObject | undefined { for (const route of routes) { if (route.path === path) return route; const nested = find(route.children ?? [], path); if (nested) return nested; } }
it.each(['tax-config', 'ird-reports'])('allows read-only access to the %s route while the page owns write guards', path => {
  const route = find((router as unknown as { routes: RouteObject[] }).routes, path);
  expect(route).toBeDefined(); expect(isValidElement(route?.element)).toBe(true);
  const guard = cloneElement(route!.element as ReactElement<{ children?: ReactNode }>, { children: <p>GST read workspace</p> });
  render(<MemoryRouter>{guard}</MemoryRouter>);
  expect(screen.getByText('GST read workspace')).toBeInTheDocument();
});
