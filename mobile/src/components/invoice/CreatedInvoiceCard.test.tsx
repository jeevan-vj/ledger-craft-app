import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { CreatedInvoiceCard } from './CreatedInvoiceCard';

describe('CreatedInvoiceCard', () => {
  it('confirms the saved draft and gives one clear next step', () => {
    const onPreview = jest.fn();
    const onEdit = jest.fn();
    const view = render(
      <CreatedInvoiceCard
        invoiceNumber="INV-2026-0006"
        onPreview={onPreview}
        onEdit={onEdit}
      />,
    );

    expect(view.getByText('Draft saved')).toBeTruthy();
    expect(view.getByText('INV-2026-0006 is ready to check and share.')).toBeTruthy();
    expect(view.queryByText('Finish this draft')).toBeNull();
    expect(view.queryByText('Record payment')).toBeNull();

    fireEvent.press(view.getByRole('button', { name: 'Preview invoice' }));
    fireEvent.press(view.getByRole('button', { name: 'Edit draft' }));
    expect(onPreview).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledTimes(1);
  });
});
