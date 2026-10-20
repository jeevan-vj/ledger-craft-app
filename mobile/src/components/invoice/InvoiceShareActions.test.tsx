import React from 'react';
import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { mockInvoice } from '@/__tests__/fixtures/invoice.fixtures';
import InvoiceShareActions from './InvoiceShareActions';

jest.mock('@/services/invoiceService', () => ({
  invoiceService: { createShareLink: jest.fn() },
}));

jest.mock('@/utils/pdfUtils', () => ({
  downloadInvoicePDF: jest.fn(),
  shareInvoicePDF: jest.fn(),
}));

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));

describe('InvoiceShareActions layout', () => {
  it('renders readable, horizontal action rows with full-width touch targets', () => {
    const { getByLabelText, getByText } = render(
      <InvoiceShareActions
        visible
        invoice={mockInvoice}
        onClose={jest.fn()}
      />,
    );

    expect(getByText('Anyone with the link can view the invoice')).toBeVisible();
    expect(getByText('Save or export a PDF copy')).toBeVisible();
    expect(getByText('Attach the PDF to another app')).toBeVisible();

    const shareRow = getByLabelText('Share link');
    expect(typeof shareRow.props.style).not.toBe('function');
    expect(StyleSheet.flatten(shareRow.props.style)).toMatchObject({
      flexDirection: 'row',
      minHeight: 72,
      width: '100%',
    });
  });
});
