import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { SaleTileGrid } from './SaleTileGrid';

const memory = new Map<string, string>();
const sections = [{ id: 'bakery', name: 'Bakery', color: null, items: ['Pie', 'Roll'].map((name) => ({ id: name, name, type: 'product' as const, salePrice: '4.50', unit: 'ea', enableSaleInfo: true, enablePurchaseInfo: false })) }];
const props = { sections, tileWidth: 160, quantityForItem: () => null, onAdd: jest.fn(), onQuantity: jest.fn() };
beforeEach(() => {
  memory.clear(); jest.clearAllMocks();
  jest.mocked(SecureStore.getItemAsync).mockImplementation(async (key) => memory.get(key) ?? null);
  jest.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => { memory.set(key, value); });
});

it('accepts the next tap after a completed long press opens quantity editing', () => {
  const screen = render(<SaleTileGrid {...props} />);
  const tile = screen.getByLabelText('Pie, $4.50 including GST');
  fireEvent(tile, 'longPress');
  fireEvent(tile, 'pressOut');
  expect(props.onQuantity).toHaveBeenCalledWith(sections[0].items[0]);
  fireEvent.press(tile);
  expect(props.onAdd).toHaveBeenCalledWith(sections[0].items[0]);
});

it('persists favourites and tile ordering across remounts', async () => {
  const screen = render(<SaleTileGrid {...props} />);
  await waitFor(() => expect(screen.getByLabelText('Arrange tiles')).not.toBeDisabled());
  fireEvent.press(screen.getByLabelText('Arrange tiles'));
  fireEvent.press(screen.getByLabelText('Move Roll earlier'));
  await waitFor(() => expect(screen.getAllByLabelText(/including GST/).map((tile) => tile.props.accessibilityLabel)).toEqual(['Roll, $4.50 including GST', 'Pie, $4.50 including GST']));
  await waitFor(() => expect(screen.getByLabelText('Add Roll to favourites')).not.toBeDisabled());
  fireEvent.press(screen.getByLabelText('Add Roll to favourites'));
  await screen.findByLabelText('Category Favourites');
  await waitFor(() => expect(screen.getByLabelText('Remove Roll from favourites')).not.toBeDisabled());
  screen.unmount();
  const restored = render(<SaleTileGrid {...props} />);
  await restored.findByLabelText('Category Favourites');
  expect(restored.getAllByLabelText(/including GST/)[0].props.accessibilityLabel).toBe('Roll, $4.50 including GST');
});

it('shows storage failures and lets selling continue without claiming the preference saved', async () => {
  jest.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(new Error('full'));
  const screen = render(<SaleTileGrid {...props} />);
  await waitFor(() => expect(screen.getByLabelText('Arrange tiles')).not.toBeDisabled());
  fireEvent.press(screen.getByLabelText('Arrange tiles'));
  fireEvent.press(screen.getByLabelText('Add Pie to favourites'));
  expect(await screen.findByText("Couldn't save tile preferences. Try again.")).toBeTruthy();
  expect(screen.queryByLabelText('Category Favourites')).toBeNull();
  fireEvent.press(screen.getByLabelText('Pie, $4.50 including GST'));
  expect(props.onAdd).toHaveBeenCalledWith(sections[0].items[0]);
});

it('retries loading preferences without blocking item sales', async () => {
  jest.mocked(SecureStore.getItemAsync).mockRejectedValueOnce(new Error('locked'));
  const screen = render(<SaleTileGrid {...props} />);
  expect(await screen.findByText("Couldn't load tile preferences. Try again.")).toBeTruthy();
  expect(screen.getByLabelText('Arrange tiles')).toBeDisabled();
  fireEvent.press(screen.getByLabelText('Pie, $4.50 including GST'));
  expect(props.onAdd).toHaveBeenCalledWith(sections[0].items[0]);
  fireEvent.press(screen.getByLabelText('Retry tile preferences'));
  await waitFor(() => expect(screen.getByLabelText('Arrange tiles')).not.toBeDisabled());
  expect(screen.queryByLabelText('Retry tile preferences')).toBeNull();
});

it('keeps the saved order after remount with no favourites', async () => {
  const screen = render(<SaleTileGrid {...props} />);
  await waitFor(() => expect(screen.getByLabelText('Arrange tiles')).not.toBeDisabled());
  fireEvent.press(screen.getByLabelText('Arrange tiles'));
  fireEvent.press(screen.getByLabelText('Move Roll earlier'));
  await waitFor(() => expect(screen.getByLabelText('Move Roll later')).not.toBeDisabled());
  screen.unmount();
  const restored = render(<SaleTileGrid {...props} />);
  await waitFor(() => expect(restored.getAllByLabelText(/including GST/).map((tile) => tile.props.accessibilityLabel)).toEqual(['Roll, $4.50 including GST', 'Pie, $4.50 including GST']));
});
