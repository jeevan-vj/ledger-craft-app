import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import Items from '../Items';
import TaxOverviewPage from '../TaxOverviewPage';

const { createCategory } = vi.hoisted(() => ({ createCategory: vi.fn().mockResolvedValue({ id: 'cat', name: 'Advisory' }) }));
vi.mock('@/hooks/useAppData', () => ({ useAppData: () => ({
  items: [], itemCategories: [], isLoadingItems: false, createItemCategory: createCategory,
}) }));
vi.mock('@/context/StableAuthContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/components/item/ItemDrawer', () => ({ default: ({ onCreateCategory }: {
  onCreateCategory: (category: { name: string }) => Promise<unknown>;
}) => <button onClick={() => void onCreateCategory({ name: 'Advisory' })}>Create test category</button> }));

describe('legacy page boundaries', () => {
  it('passes a category object through once instead of nesting its name', async () => {
    render(<MemoryRouter><Items /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Create test category' }));
    await waitFor(() => expect(createCategory).toHaveBeenCalledWith({ name: 'Advisory' }));
  });

  it('opens the current tax workspace from the old overview route', async () => {
    render(<MemoryRouter initialEntries={['/tax-overview']}><Routes>
      <Route path="/tax-overview" element={<TaxOverviewPage />} />
      <Route path="/ird-reports" element={<p>Current tax workspace</p>} />
    </Routes></MemoryRouter>);
    expect(await screen.findByText('Current tax workspace')).toBeInTheDocument();
  });
});
