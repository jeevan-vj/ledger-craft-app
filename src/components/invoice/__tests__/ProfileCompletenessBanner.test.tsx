import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ProfileCompletenessBanner } from '../ProfileCompletenessBanner';

describe('ProfileCompletenessBanner', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('shows missing logo, address, and bank details', () => {
    render(
      <MemoryRouter>
        <ProfileCompletenessBanner
          profile={{
            logoUrl: null,
            address: null,
            city: null,
            bankInfo: null,
          }}
        />
      </MemoryRouter>
    );

    expect(screen.getByTestId('profile-completeness-banner')).toHaveTextContent(/logo/i);
    expect(screen.getByRole('link', { name: /update in settings/i })).toHaveAttribute(
      'href',
      '/settings'
    );
  });

  it('hides after dismiss', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ProfileCompletenessBanner
          profile={{
            logoUrl: null,
            address: null,
            city: null,
            bankInfo: null,
          }}
        />
      </MemoryRouter>
    );

    await user.click(screen.getByTestId('profile-completeness-dismiss'));
    expect(screen.queryByTestId('profile-completeness-banner')).not.toBeInTheDocument();
  });

  it('does not render when the profile is complete', () => {
    render(
      <MemoryRouter>
        <ProfileCompletenessBanner
          profile={{
            logoUrl: 'https://cdn.example/logo.png',
            address: '12 Queen St',
            city: 'Auckland',
            bankInfo: '12-3456-7890123-00',
          }}
        />
      </MemoryRouter>
    );

    expect(screen.queryByTestId('profile-completeness-banner')).not.toBeInTheDocument();
  });
});
