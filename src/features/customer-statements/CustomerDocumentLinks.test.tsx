import { expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CustomerDocumentLinks } from './CustomerDocumentLinks';
it('renders separate accessible quote and statement links without an invalid multi-child Slot', () => {
 render(<MemoryRouter><CustomerDocumentLinks customer={{ id: 'customer-id', name: 'Harbour Cafe' }} /></MemoryRouter>);
 expect(screen.getByRole('link', {name:'Quotes for Harbour Cafe'})).toHaveAttribute('href','/quotes?customerId=customer-id');
 expect(screen.getByRole('link', {name:'Statement for Harbour Cafe'})).toHaveAttribute('href','/customer-statements?customerId=customer-id');
});
