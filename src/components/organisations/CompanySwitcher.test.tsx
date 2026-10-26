import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CompanySwitcher } from './CompanySwitcher';

const { list } = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock('@/features/organisations/api', () => ({
  organisationsApi: { list, switch: vi.fn() },
}));

describe('CompanySwitcher', () => {
  beforeEach(() => {
    list.mockResolvedValue({
      organisations: [{
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Crystal Touch Cleaning',
        role: 'owner',
        isActive: true,
        archivedAt: null,
      }],
    });
  });

  it('gives the active company label enough room and preserves its full name', async () => {
    render(<CompanySwitcher />);

    const label = await screen.findByText('Crystal Touch Cleaning');
    expect(label).toHaveAttribute('title', 'Crystal Touch Cleaning');
    expect(label).toHaveClass('max-w-[260px]');
  });
});
