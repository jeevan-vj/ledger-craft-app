import React from 'react';
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { AgingTable } from '../FinancialReportsPage';

it('shows unallocated posted debt without claiming there are no receivables', () => {
  render(<AgingTable noun="receivables" report={{ total: '5000.00', unallocatedControl: '5000.00',
    current: '0.00', days1To30: '0.00', days31To60: '0.00', days61To90: '0.00', over90: '0.00', items: [] }} />);
  expect(screen.getByRole('alert')).toHaveTextContent('5,000.00');
  expect(screen.getByRole('alert')).toHaveTextContent('customer or supplier');
  expect(screen.queryByText('No outstanding receivables at the report date.')).not.toBeInTheDocument();
});
