import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { GstPreparationPanel } from './GstPreparationPanel';
import { gstPreparationApi } from '@/features/reports/api/gstPreparationApi';

jest.mock('@/features/reports/api/gstPreparationApi', () => ({ gstPreparationApi: { prepare: jest.fn(), review: jest.fn(), listDrafts: jest.fn(), save: jest.fn(), get: jest.fn() } }));
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

it('prepares payments basis independently and invalidates invoice figures when basis changes', async () => {
  const screen = render(<GstPreparationPanel />);
  fireEvent.press(screen.getByText('Prepare GST figures'));
  await screen.findByText('Net GST payable: $120.00');
  fireEvent.press(screen.getByText('Payments basis'));
  expect(screen.queryByText('Net GST payable: $120.00')).toBeNull();
  jest.mocked(gstPreparationApi.prepare).mockResolvedValue({ ...figures, basis: 'payments', gstOnSales: '180.00', gstOnPurchases: '39.00', netGstPosition: '141.00' } as never);
  fireEvent.press(screen.getByText('Prepare GST figures'));
  expect(await screen.findByText('Net GST payable: $141.00')).toBeTruthy();
  expect(gstPreparationApi.prepare).toHaveBeenLastCalledWith(expect.any(String), expect.any(String), 'payments');
});

it('requires explicit review when foreign conversion policy needs confirmation', async () => {
  jest.mocked(gstPreparationApi.prepare).mockResolvedValue({ ...figures, requiresReview: true } as never);
  const screen = render(<GstPreparationPanel />);
  fireEvent.press(screen.getByText('Prepare GST figures'));
  await screen.findByText('Net GST payable: $120.00');
  fireEvent.press(screen.getByText('Save GST draft'));
  expect(gstPreparationApi.save).not.toHaveBeenCalled();
  expect(screen.getByText('GST source figures require accountant review before saving')).toBeTruthy();
});

it('reviews sourced output minus15 and input plus3 before saving authoritative117 GST', async () => {
  const reviewed = { ...figures, gstOnSales: '195.00', gstOnPurchases: '78.00', netGstPosition: '117.00', review: { confirmed: true, adjustments: [], reviewedAt: '2026-11-06T00:00:00.000Z', reviewedBy: 'owner', unadjustedGstOnSales: '210.00', unadjustedGstOnPurchases: '75.00' } };
  jest.mocked(gstPreparationApi.review).mockResolvedValue(reviewed as never);
  const screen = render(<GstPreparationPanel />);
  fireEvent.press(screen.getByText('Prepare GST figures'));
  await screen.findByText('Net GST payable: $120.00');
  fireEvent.press(screen.getByText('Review GST adjustments'));
  fireEvent.changeText(screen.getByLabelText('Signed GST adjustment'), '-15.00');
  fireEvent.changeText(screen.getByLabelText('Adjustment source reference'), 'CN-001');
  fireEvent.changeText(screen.getByLabelText('Adjustment reason'), 'Reviewed customer credit note');
  fireEvent.press(screen.getByText('Add adjustment'));
  fireEvent.press(screen.getByText('Purchase GST'));
  fireEvent.changeText(screen.getByLabelText('Signed GST adjustment'), '3.00');
  fireEvent.changeText(screen.getByLabelText('Adjustment source reference'), 'REC-001');
  fireEvent.changeText(screen.getByLabelText('Adjustment reason'), 'Reviewed input GST correction');
  fireEvent.press(screen.getByText('Add adjustment'));
  fireEvent(screen.getByLabelText('Confirm GST adjustment review'), 'valueChange', true);
  fireEvent.press(screen.getByText('Apply reviewed GST adjustments'));
  expect(await screen.findByText('Net GST payable: $117.00')).toBeTruthy();
  expect(gstPreparationApi.review).toHaveBeenCalledWith(expect.objectContaining({ reviewConfirmed: true, adjustments: [expect.objectContaining({ kind: 'output', amount: '-15.00', sourceReference: 'CN-001' }), expect.objectContaining({ kind: 'input', amount: '3.00', sourceReference: 'REC-001' })] }));
  fireEvent.press(screen.getByText('Save GST draft'));
  await screen.findByText('Saved GST return: draft');
  expect(gstPreparationApi.save).toHaveBeenCalledWith(reviewed);
});
it('reloads a saved reviewed117 draft instead of silently replacing it with raw135 figures',async()=>{
 const raw={...figures,totalSales:'1610.00',totalPurchases:'625.00',gstOnSales:'210.00',gstOnPurchases:'75.00',netGstPosition:'135.00'};
 const review={confirmed:true,reviewedAt:'2026-11-06T00:00:00.000Z',reviewedBy:'owner',adjustments:[{kind:'output',amount:'-15.00',reason:'Reviewed output tax correction',sourceReference:'ADJ-OUT'},{kind:'input',amount:'3.00',reason:'Reviewed input tax correction',sourceReference:'ADJ-IN'}],unadjustedGstOnSales:'210.00',unadjustedGstOnPurchases:'75.00',unadjustedTotalSales:'1610.00',unadjustedTotalPurchases:'625.00'};
 jest.mocked(gstPreparationApi.prepare).mockResolvedValue(raw as never);jest.mocked(gstPreparationApi.listDrafts).mockResolvedValue([{...draft,totalSales:'1610.00',totalPurchases:'625.00',gstOnSales:'195.00',gstOnPurchases:'78.00',netGst:'117.00',returnData:{preparation:{basis:'invoice',baseCurrency:'NZD'},gstReview:review}}] as never);
 const screen=render(<GstPreparationPanel/>);fireEvent.changeText(screen.getByLabelText('GST period start'),figures.from);fireEvent.changeText(screen.getByLabelText('GST period end'),figures.to);fireEvent.press(screen.getByText('Prepare GST figures'));
 expect(await screen.findByText('Net GST payable: $117.00')).toBeTruthy();expect(screen.queryByText('Net GST payable: $135.00')).toBeNull();
});

it('uses persisted hybrid basis and server period dates without offering a silent basis change', async () => {
 const screen = render(<GstPreparationPanel initialFrom="2026-04-01" initialTo="2026-05-31" registeredBasis="hybrid" />);
 expect(screen.getByLabelText('GST period start').props.value).toBe('2026-04-01'); expect(screen.getByLabelText('GST period end').props.value).toBe('2026-05-31');
 expect(screen.getByText('Registered GST basis: Hybrid')).toBeTruthy(); expect(screen.queryByText('Payments basis')).toBeNull();
 fireEvent.press(screen.getByText('Prepare GST figures')); await waitFor(() => expect(gstPreparationApi.prepare).toHaveBeenCalledWith('2026-04-01', '2026-05-31', 'hybrid'));
});
it('records explicit zero-rated/exempt classification with reason/reference rather than guessing from zero tax', async () => {
 jest.mocked(gstPreparationApi.prepare).mockResolvedValue({ ...figures, unclassifiedSales: '500.00', requiresReview: true, warnings: ['Review zero-rated or exempt sales.'] } as never);
 jest.mocked(gstPreparationApi.review).mockResolvedValue({ ...figures, requiresReview: false, review: { confirmed: true, adjustments: [] } } as never);
 const screen = render(<GstPreparationPanel />); fireEvent.press(screen.getByText('Prepare GST figures')); await screen.findByText('Review zero-rated or exempt sales.');
 fireEvent.press(screen.getByText('Review GST adjustments')); fireEvent.press(screen.getByText('Review zero-rated and exempt sales'));
 fireEvent.changeText(screen.getByLabelText('Reviewed zero-rated sales'), '500.00'); fireEvent.changeText(screen.getByLabelText('Reviewed exempt sales'), '0.00'); fireEvent.changeText(screen.getByLabelText('Sales classification reason'), 'Verified export services'); fireEvent.changeText(screen.getByLabelText('Sales classification source reference'), 'EXPORT-001');
 fireEvent(screen.getByLabelText('Confirm GST adjustment review'), 'valueChange', true); fireEvent.press(screen.getByText('Apply reviewed GST adjustments'));
 await waitFor(() => expect(gstPreparationApi.review).toHaveBeenCalledWith(expect.objectContaining({ salesClassificationReview: { zeroRatedSales: '500.00', exemptSales: '0.00', reason: 'Verified export services', sourceReference: 'EXPORT-001' } })));
});
it('requires renewed review when source fingerprint changes even if the displayed amounts stay equal', async () => { jest.mocked(gstPreparationApi.prepare).mockResolvedValueOnce({ ...figures, calculation: { fingerprint: 'a'.repeat(64), myIrBoxes: {} } } as never).mockResolvedValueOnce({ ...figures, calculation: { fingerprint: 'b'.repeat(64), myIrBoxes: {} } } as never); const screen = render(<GstPreparationPanel />); fireEvent.press(screen.getByText('Prepare GST figures')); await screen.findByText('Net GST payable: $120.00'); fireEvent.press(screen.getByText('Save GST draft')); expect(await screen.findByText('Figures or source books changed. Review the refreshed figures, then save the draft again.')).toBeTruthy(); expect(gstPreparationApi.save).not.toHaveBeenCalled(); });
it('creates a new revision instead of patching an immutable canonical draft', async () => { jest.mocked(gstPreparationApi.listDrafts).mockResolvedValue([{ ...draft, returnData: { gstCalculation: { fingerprint: 'a'.repeat(64) } } }] as never); const s = render(<GstPreparationPanel initialFrom={figures.from} initialTo={figures.to} />); fireEvent.press(s.getByText('Prepare GST figures')); await s.findByText('Saved GST return: draft'); fireEvent.press(s.getByText('Save revised GST draft')); await waitFor(() => expect(gstPreparationApi.save).toHaveBeenCalledWith(figures)); expect(gstPreparationApi.save).not.toHaveBeenCalledWith(figures, 'draft-1'); });
