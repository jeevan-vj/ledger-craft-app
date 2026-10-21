import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppErrorBoundary } from '@/components/errors/AppErrorBoundary';
import { AppErrorFallback, RouteErrorFallback } from '@/components/errors/AppErrorFallback';

function BrokenScreen(): never {
  throw new Error('share token sekret-token and password hunter2');
}

describe('AppErrorFallback', () => {
  it('offers a reload action without showing the error details', async () => {
    const onReload = vi.fn();
    const user = userEvent.setup();
    render(<AppErrorFallback onReload={onReload} />);

    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
    expect(screen.getByText(/reload the page to continue/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reload' }));

    expect(onReload).toHaveBeenCalledOnce();
    expect(screen.queryByText(/sekret-token/)).not.toBeInTheDocument();
  });
});

describe('AppErrorBoundary', () => {
  it('replaces a crashed screen with the reload fallback', async () => {
    const onReload = vi.fn();
    const user = userEvent.setup();
    render(
      <AppErrorBoundary onReload={onReload}>
        <BrokenScreen />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText(/hunter2/)).not.toBeInTheDocument();
    expect(screen.queryByText(/sekret-token/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reload' }));
    expect(onReload).toHaveBeenCalledOnce();
  });
});

describe('RouteErrorFallback', () => {
  it('renders when a route throws', async () => {
    const onReload = vi.fn();
    const user = userEvent.setup();
    const router = createMemoryRouter(
      [{ path: '/', element: <BrokenScreen />, errorElement: <RouteErrorFallback onReload={onReload} /> }],
      { initialEntries: ['/'] },
    );

    render(<RouterProvider router={router} />);

    expect(await screen.findByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
    expect(screen.queryByText(/hunter2/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reload' }));
    expect(onReload).toHaveBeenCalledOnce();
  });
});
