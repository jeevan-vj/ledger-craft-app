import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ItemForm } from './ItemForm';

vi.mock('@/hooks/useAppData', () => ({ useAppData: () => ({ itemCategories: [], units: [], createItemCategory: vi.fn() }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

describe('catalogue price accessibility', () => {
  it('names both price inputs for assistive technology', () => {
    render(<ItemForm onSubmit={vi.fn()} categories={[]} />);
    fireEvent.click(screen.getByRole('button', { name: /Purchase Information/ }));
    expect(screen.getByRole('spinbutton', { name: 'Sale Price *' })).toBe(screen.getByLabelText('Sale Price *'));
    expect(screen.getByRole('spinbutton', { name: 'Purchase Price *' })).toBe(screen.getByLabelText('Purchase Price *'));
  });
});
