import React from 'react';
import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { InvoiceDetailActions } from './InvoiceDetailActions';

describe('InvoiceDetailActions', () => {
  it('gives Share and Edit the full 48pt secondary action targets', () => {
    const { getByLabelText } = render(
      <InvoiceDetailActions
        isPaid
        bottomInset={82}
        onPreview={jest.fn()}
        onRecordPayment={jest.fn()}
        onShare={jest.fn()}
        onEdit={jest.fn()}
      />,
    );

    for (const label of ['Share invoice', 'Edit invoice']) {
      const style = StyleSheet.flatten(getByLabelText(label).props.style);
      expect(style.minHeight).toBeGreaterThanOrEqual(48);
      expect(style.flex).toBe(1);
    }
  });

  it('keeps the action content above the native tab bar with breathing room', () => {
    const { getByTestId } = render(
      <InvoiceDetailActions
        isPaid={false}
        bottomInset={82}
        onPreview={jest.fn()}
        onRecordPayment={jest.fn()}
        onShare={jest.fn()}
        onEdit={jest.fn()}
      />,
    );

    expect(StyleSheet.flatten(getByTestId('invoice-detail-actions').props.style).paddingBottom).toBe(102);
  });
});
