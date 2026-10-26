import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { InvoiceImportPage } from './InvoiceImportPage';

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => false, isAuthenticated: true }),
}));

describe('InvoiceImportPage', () => {
  it('shows a clear denied state for a read-only member', () => {
    render(<MemoryRouter><InvoiceImportPage /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Import access restricted' })).toBeInTheDocument();
    expect(screen.getByText("You don't have permission to import invoices")).toBeInTheDocument();
  });
});
