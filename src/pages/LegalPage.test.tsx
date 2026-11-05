import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { PrivacyPage } from './LegalPage';

describe('PrivacyPage', () => {
  it('discloses indefinite non-identifying deletion tombstone retention', () => {
    render(<MemoryRouter><PrivacyPage /></MemoryRouter>);

    expect(screen.getByText(/deletion tombstone.*indefinitely/i)).toBeInTheDocument();
  });
});
