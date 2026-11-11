import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { GstSavedReturn } from './GstSavedReturn';
import { gstSettingsApi } from './gstSettingsApi';
vi.mock('./gstSettingsApi', () => ({ gstSettingsApi: { file: vi.fn(), recalculation: vi.fn(), reopen: vi.fn() } }));
vi.mock('./export/gstReturnPdf', () => ({ downloadGstReturnPdf: vi.fn() }));
const value = { id: 'return', returnType: 'GST', periodStart: '2026-11-01', periodEnd: '2026-11-30', status: 'draft', totalSales: '1610.00', totalPurchases: '625.00', gstOnSales: '210.00', gstOnPurchases: '75.00', netGst: '135.00', irdReference: null, returnData: { preparation: { basis: 'hybrid', dueDate: '2027-01-15', baseCurrency: 'NZD' }, gstCalculation: { version: 'gst-ledger-v2', fingerprint: 'hash', warnings: [], sourceCounts: {}, myIrBoxes: {} } } };
beforeEach(() => vi.clearAllMocks());
it('records an external myIR filing only after explicit confirmation, preserving exact saved figures', async () => {
  vi.mocked(gstSettingsApi.file).mockResolvedValue({ ...value, status: 'submitted', irdReference: 'MYIR-0123' } as never);
  const onFiled = vi.fn(); render(<GstSavedReturn value={value as never} onFiled={onFiled} />);
  expect(screen.getByText('NZD 135.00')).toBeInTheDocument();
  expect(screen.getByText('Hybrid basis')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Record existing myIR filing' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('myIR confirmation reference'), { target: { value: 'MYIR-0123' } });
  fireEvent.click(screen.getByLabelText('I have already filed this return separately in myIR'));
  fireEvent.click(screen.getByRole('button', { name: 'Record existing myIR filing' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Existing myIR filing recorded');
  expect(gstSettingsApi.file).toHaveBeenCalledWith('return', 'MYIR-0123');
  expect(onFiled).toHaveBeenCalled();
});
it('keeps a filed snapshot read-only and shows its actual confirmation reference', () => {
  render(<GstSavedReturn value={{ ...value, status: 'submitted', irdReference: 'MYIR-SAVED' } as never} onFiled={vi.fn()} />);
  expect(screen.getByText('MYIR-SAVED')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Record existing myIR filing' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Download GST record PDF' })).toBeInTheDocument();
});

it('previews changed books with original settings beside the immutable filed values', async () => {
  vi.mocked(gstSettingsApi.recalculation).mockResolvedValue({ recorded: { ...value, status: 'submitted' }, current: { basis: 'hybrid', totalSales: '1500.00', totalPurchases: '625.00', gstOnSales: '205.00', gstOnPurchases: '75.00', netGstPosition: '130.00', warnings: ['Review the newly changed source records.'] }, difference: { totalSales: '-110.00', totalPurchases: '0.00', gstOnSales: '-5.00', gstOnPurchases: '0.00', netGst: '-5.00' }, settingsChanged: true } as never);
  render(<GstSavedReturn value={{ ...value, status: 'submitted', irdReference: 'MYIR-SAVED' } as never} onFiled={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Preview current books using original settings' }));
  expect(await screen.findByText('NZD 130.00')).toBeInTheDocument();
  expect(screen.getByText('NZD 135.00')).toBeInTheDocument();
  expect(screen.getByText('NZD -5.00')).toBeInTheDocument();
  expect(screen.getByText(/registered choices have changed/)).toBeInTheDocument();
  expect(gstSettingsApi.file).not.toHaveBeenCalled();
});
it('keeps original mapping warnings visible when viewing a saved return', () => {
  render(<GstSavedReturn value={{ ...value, returnData: { ...value.returnData, gstCalculation: { version: 'gst-ledger-v2', fingerprint: 'hash', sourceCounts: {}, myIrBoxes: {}, mappingStatus: 'requires_confirmation', warnings: ['Box 11 needs confirmation from the supporting purchase records.'] } } } as never} onFiled={vi.fn()} />);
  expect(screen.getByRole('alert')).toHaveTextContent('Box 11 needs confirmation');
});

it('does not invent a basis or offer filing for an unverified legacy draft', () => {
  const prepare = vi.fn();
  render(<GstSavedReturn value={{ ...value, returnData: null } as never} onFiled={vi.fn()} onPrepareNew={prepare} />);
  expect(screen.getByText('Original GST basis not recorded')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('no verified source snapshot');
  expect(screen.queryByRole('button', { name: 'Record existing myIR filing' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Prepare a new draft from current books' }));
  expect(prepare).toHaveBeenCalled();
  expect(gstSettingsApi.file).not.toHaveBeenCalled();
});
it('asks an owner for a reason before reopening a filed snapshot', async () => {
  vi.mocked(gstSettingsApi.reopen).mockResolvedValue({ ...value, status: 'submitted', irdReference: 'MYIR-SAVED', supersededAt: '2026-11-11T00:00:00.000Z', reopenReason: 'Correct the October invoice' } as never);
  render(<GstSavedReturn value={{ ...value, status: 'submitted', irdReference: 'MYIR-SAVED' } as never} onFiled={vi.fn()} canReopen />);
  expect(screen.queryByRole('button', { name: 'Reopen filed period' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Reason for reopening'), { target: { value: 'Correct the October invoice' } });
  fireEvent.click(screen.getByRole('button', { name: 'Reopen filed period' }));
  expect(await screen.findByRole('status')).toHaveTextContent('This filed snapshot was superseded: Correct the October invoice');
  expect(gstSettingsApi.reopen).toHaveBeenCalledWith('return', 'Correct the October invoice');
});
it('hides reopen from people who cannot administer the company', () => {
  render(<GstSavedReturn value={{ ...value, status: 'submitted', irdReference: 'MYIR-SAVED' } as never} onFiled={vi.fn()} canReopen={false} />);
  expect(screen.queryByRole('button', { name: 'Reopen filed period' })).not.toBeInTheDocument();
});
it('keeps filing and new-draft writes unavailable for read-only viewers', () => {
  render(<GstSavedReturn value={value as never} onFiled={vi.fn()} onPrepareNew={vi.fn()} canWrite={false} />);
  expect(screen.queryByRole('button', { name: 'Record existing myIR filing' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Prepare a new draft from current books' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Download GST record PDF' })).toBeInTheDocument();
});
