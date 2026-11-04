import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { FinishDraftCard } from './FinishDraftCard';
import type { Invoice } from '@/types/invoice';

const invoice: Invoice = {
  id: 'inv-1',
  invoiceNumber: 'INV-2026-0001',
  customerId: 'cust-1',
  date: '2026-11-04',
  dueDate: '2026-12-04',
  items: [{
    id: 'line-1',
    description: 'Logo design',
    quantity: 1,
    unit: 'each',
    rate: 80,
    total: 80,
    taxes: [{ id: 'default', name: 'GST', rate: 15 }],
  }],
  subtotal: 80,
  taxAmount: 12,
  total: 92,
  status: 'draft',
  currency: 'NZD',
  taxInclusive: false,
};

function renderCard(overrides: Partial<React.ComponentProps<typeof FinishDraftCard>> = {}) {
  const props = {
    invoice,
    saving: false,
    onDueDate: jest.fn(),
    onAddLine: jest.fn(),
    onPreview: jest.fn(),
    ...overrides,
  };
  return { ...render(<FinishDraftCard {...props} />), props };
}

describe('FinishDraftCard', () => {
  it('adds a line and opens the preview', () => {
    const view = renderCard();
    expect(view.getByText('GST stays at 15%.')).toBeTruthy();
    fireEvent.changeText(view.getByLabelText('Description'), 'Hosting');
    fireEvent.changeText(view.getByLabelText('Quantity'), '2');
    fireEvent.changeText(view.getByLabelText('Amount each'), '40.50');
    expect(view.getByText('Line total $81.00.')).toBeTruthy();
    fireEvent.press(view.getByRole('button', { name: 'Add line' }));
    expect(view.props.onAddLine).toHaveBeenCalledWith({
      description: 'Hosting',
      quantity: '2',
      amount: '40.50',
    });
    fireEvent.press(view.getByRole('button', { name: 'Preview invoice' }));
    expect(view.props.onPreview).toHaveBeenCalledTimes(1);
  });

  it('keeps an incomplete line off the invoice', () => {
    const view = renderCard();
    fireEvent.press(view.getByRole('button', { name: 'Add line' }));
    expect(view.getByTestId('finish-draft-error').props.children).toBe('Describe what you are charging for.');
    expect(view.props.onAddLine).not.toHaveBeenCalled();
  });

  it('asks the parent to save a new due date', () => {
    const view = renderCard();
    fireEvent.press(view.getByRole('button', { name: 'Due date' }));
    fireEvent.press(view.getByRole('button', { name: 'Net 7' }));
    expect(view.props.onDueDate).toHaveBeenCalledWith('2026-11-11');
  });
});
