import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { FxRevaluationPanel } from './FxRevaluationPanel';
import { fxRevaluationApi } from '@/features/accounting/fxRevaluationApi';
jest.mock('@/features/accounting/fxRevaluationApi', () => ({ fxRevaluationApi: { rates: jest.fn(), preview: jest.fn(), post: jest.fn() } }));
const result={ asOfDate: '2026-11-06', reversalDate: '2026-11-07', baseCurrency: 'NZD', unrealizedGain: '5.00', unrealizedLoss: '0.00', positions: [{ documentType:'invoice', documentId:'inv', documentNumber:'USD-100', currency:'USD', foreignOutstanding:'100.00', bookBaseAmount:'160.00', revaluedBaseAmount:'165.00', exchangeDifference:'5.00' }], warnings:[],journalEntryIds:[],reversalJournalEntryIds:[],replayed:false };
beforeEach(()=>{jest.clearAllMocks();jest.mocked(fxRevaluationApi.rates).mockResolvedValue([{id:'55555555-5555-4555-8555-555555555555',currencyCode:'USD',rate:'1.65',effectiveDate:'2026-11-06'}] as never);jest.mocked(fxRevaluationApi.preview).mockResolvedValue(result as never);jest.mocked(fxRevaluationApi.post).mockResolvedValue({...result,journalEntryIds:['posting'],reversalJournalEntryIds:['reversal']} as never);});
it('previews USD100 carrying160 revalued165, then posts a reviewed5 gain with nextday reversal',async()=>{
 const screen=render(<FxRevaluationPanel/>);fireEvent.press(screen.getByText('Review period-end FX'));fireEvent.press(await screen.findByText('USD · 1.65 NZD · 2026-11-06'));
 fireEvent.changeText(screen.getByLabelText('FX valuation reason'),'Reviewed period-end currency balances');fireEvent.press(screen.getByText('Preview FX revaluation'));
 expect(await screen.findByText('Unrealized gain: $5.00')).toBeTruthy();expect(screen.getByText('Automatic reversal date: 2026-11-07')).toBeTruthy();
 fireEvent(screen.getByLabelText('Confirm FX revaluation review'),'valueChange',true);fireEvent.press(screen.getByText('Post reviewed FX revaluation'));
 expect(await screen.findByText('Revaluation posted: 1 journal, 1 reversal')).toBeTruthy();expect(fxRevaluationApi.post).toHaveBeenCalledWith(expect.objectContaining({exchangeRateIds:['55555555-5555-4555-8555-555555555555'],reviewed:true}));
});
it('requires review again when outstanding balances change between preview and posting',async()=>{
 const screen=render(<FxRevaluationPanel/>);fireEvent.press(screen.getByText('Review period-end FX'));fireEvent.press(await screen.findByText('USD · 1.65 NZD · 2026-11-06'));fireEvent.changeText(screen.getByLabelText('FX valuation reason'),'Reviewed currency balances');fireEvent.press(screen.getByText('Preview FX revaluation'));await screen.findByText('Unrealized gain: $5.00');
 jest.mocked(fxRevaluationApi.preview).mockResolvedValue({...result,unrealizedGain:'2.50'} as never);fireEvent(screen.getByLabelText('Confirm FX revaluation review'),'valueChange',true);fireEvent.press(screen.getByText('Post reviewed FX revaluation'));
 expect(await screen.findByText('Balances changed. Review the refreshed revaluation before posting.')).toBeTruthy();expect(fxRevaluationApi.post).not.toHaveBeenCalled();
});
