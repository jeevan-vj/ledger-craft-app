import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { GstPreparationPanel } from './GstPreparationPanel';
import { gstPreparationApi } from '@/features/reports/api/gstPreparationApi';

jest.mock('@/features/reports/api/gstPreparationApi', () => ({ gstPreparationApi: { prepare: jest.fn(), listDrafts: jest.fn(), save: jest.fn(), get: jest.fn() } }));
const figures = { basis: 'invoice', from: '2026-11-01', to: '2026-11-06', baseCurrency: 'NZD', totalSales: '1150.00', totalPurchases: '230.00', gstOnSales: '150.00', gstOnPurchases: '30.00', netGstPosition: '120.00', warnings: [] };
const draft = { id: 'draft-1', status: 'draft', periodStart: figures.from, periodEnd: figures.to };
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(gstPreparationApi.prepare).mockResolvedValue(figures as never);
  jest.mocked(gstPreparationApi.listDrafts).mockResolvedValue([]);
  jest.mocked(gstPreparationApi.save).mockResolvedValue(draft as never);
  jest.mocked(gstPreparationApi.get).mockResolvedValue(draft as never);
});
it('prepares exact server figures and saves then reloads a GST draft', async () => {
  const screen = render(<GstPreparationPanel />);
  fireEvent.changeText(screen.getByLabelText('GST period start'), figures.from);
  fireEvent.changeText(screen.getByLabelText('GST period end'), figures.to);
  fireEvent.press(screen.getByText('Prepare GST figures'));
  expect(await screen.findByText('Net GST payable: $120.00')).toBeTruthy();
  fireEvent.press(screen.getByText('Save GST draft'));
  expect(await screen.findByText('Saved GST return: draft')).toBeTruthy();
  expect(gstPreparationApi.save).toHaveBeenCalledWith(figures);
  expect(gstPreparationApi.get).toHaveBeenCalledWith('draft-1');
});
it('validates dates before requesting server figures and displays retryable server errors', async () => {
  const screen = render(<GstPreparationPanel />);
  fireEvent.changeText(screen.getByLabelText('GST period start'), '2026-12-01');
  fireEvent.changeText(screen.getByLabelText('GST period end'), '2026-11-01');
  fireEvent.press(screen.getByText('Prepare GST figures'));
  expect(screen.getByText('Choose valid dates with the period start on or before its end.')).toBeTruthy();
  expect(gstPreparationApi.prepare).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByLabelText('GST period start'), figures.from);
  jest.mocked(gstPreparationApi.prepare).mockRejectedValue(new Error('GST preparation unavailable'));
  fireEvent.press(screen.getByText('Prepare GST figures'));
  await waitFor(() => expect(screen.getByText('GST preparation unavailable')).toBeTruthy());
});

it('requires review of changed accounting figures before saving a draft', async () => {
  const screen = render(<GstPreparationPanel />);
  fireEvent.press(screen.getByText('Prepare GST figures'));
  await screen.findByText('Net GST payable: $120.00');
  jest.mocked(gstPreparationApi.prepare).mockResolvedValue({ ...figures, netGstPosition: '-15.00' } as never);
  fireEvent.press(screen.getByText('Save GST draft'));
  expect(await screen.findByText('Figures changed. Review the refreshed figures, then save the draft again.')).toBeTruthy();
  expect(screen.getByText('Net GST refundable: $15.00')).toBeTruthy();
  expect(gstPreparationApi.save).not.toHaveBeenCalled();
});

it.each(['totalSales', 'totalPurchases', 'gstOnSales', 'gstOnPurchases'] as const)('requires manual review for negative %s without saving a draft', async (field) => {
  jest.mocked(gstPreparationApi.prepare).mockResolvedValue({ ...figures, [field]: '-1.00' } as never);
  const screen = render(<GstPreparationPanel />);
  fireEvent.press(screen.getByText('Prepare GST figures'));
  expect(await screen.findByText('Net reversals require manual GST adjustment review')).toBeTruthy();
  fireEvent.press(screen.getByText('Save GST draft'));
  expect(gstPreparationApi.save).not.toHaveBeenCalled();
});

it('allows a normal refundable net GST position when the underlying sales and purchases are nonnegative', async () => {
  jest.mocked(gstPreparationApi.prepare).mockResolvedValue({ ...figures, netGstPosition: '-15.00', totalSales: '-0.00' } as never);
  const screen = render(<GstPreparationPanel />);
  fireEvent.press(screen.getByText('Prepare GST figures'));
  await screen.findByText('Net GST refundable: $15.00');
  expect(screen.queryByText('Net reversals require manual GST adjustment review')).toBeNull();
  fireEvent.press(screen.getByText('Save GST draft'));
  await screen.findByText('Saved GST return: draft');
  expect(gstPreparationApi.save).toHaveBeenCalled();
});
