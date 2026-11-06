import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { VendorCreateForm } from './VendorCreateForm';
import { purchasesApi } from '@/features/purchases/api/purchasesApi';

jest.mock('@/features/purchases/api/purchasesApi', () => ({ purchasesApi: { createVendor: jest.fn() } }));

it('creates and selects a supplier without leaving the mobile bill workflow', async () => {
  const vendor = { id: 'supplier-1', name: 'Kauri Supplies', paymentTermDays: 30 };
  jest.mocked(purchasesApi.createVendor).mockResolvedValue(vendor as never);
  const selected = jest.fn();
  const screen = render(<VendorCreateForm onCreated={selected} />);
  fireEvent.changeText(screen.getByLabelText('Vendor name'), 'Kauri Supplies');
  fireEvent.changeText(screen.getByLabelText('Vendor email (optional)'), 'supplier@example.test');
  fireEvent.press(screen.getByText('Create vendor'));
  await waitFor(() => expect(selected).toHaveBeenCalledWith(vendor));
  expect(purchasesApi.createVendor).toHaveBeenCalledWith({ name: 'Kauri Supplies', email: 'supplier@example.test', paymentTermDays: 30 });
});

it('keeps supplier details and shows a server error so creation can be retried', async () => {
  jest.mocked(purchasesApi.createVendor).mockRejectedValue(new Error('Vendor could not be saved'));
  const selected = jest.fn();
  const screen = render(<VendorCreateForm onCreated={selected} />);
  fireEvent.changeText(screen.getByLabelText('Vendor name'), 'Kauri Supplies');
  fireEvent.press(screen.getByText('Create vendor'));
  expect(await screen.findByText('Vendor could not be saved')).toBeTruthy();
  expect(screen.getByDisplayValue('Kauri Supplies')).toBeTruthy();
  expect(selected).not.toHaveBeenCalled();
});

it('prevents repeated creation while the supplier request is in progress', async () => {
  let resolve!: (value: never) => void;
  jest.mocked(purchasesApi.createVendor).mockImplementation(() => new Promise((done) => { resolve = done; }));
  const screen = render(<VendorCreateForm onCreated={jest.fn()} />);
  fireEvent.changeText(screen.getByLabelText('Vendor name'), 'Kauri Supplies');
  fireEvent.press(screen.getByText('Create vendor'));
  expect(screen.getByRole('button').props.accessibilityState).toMatchObject({ busy: true, disabled: true });
  await act(async () => { resolve({ id: 'supplier-1' } as never); });
});
