import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { CompanyTaxPanel } from './CompanyTaxPanel';
import { gstPreparationApi } from '@/features/reports/api/gstPreparationApi';

jest.mock('@/features/reports/api/gstPreparationApi', () => ({ gstPreparationApi: { company: jest.fn(), companyDrafts: jest.fn(), saveCompany: jest.fn(), get: jest.fn() } }));
const response = { from: '2026-04-01', to: '2027-03-31', entityType: 'nz_company', baseCurrency: 'NZD', taxRate: '28', accountingProfit: '850.00', taxableIncome: '850.00', incomeTax: '238.00', incomeTaxPayable: '238.00', taxCredits: '0.00', excessCredits: '0.00', lossesCarriedForward: '0.00', warnings: [] };
beforeEach(() => { jest.clearAllMocks(); jest.mocked(gstPreparationApi.companyDrafts).mockResolvedValue([]); jest.mocked(gstPreparationApi.company).mockResolvedValue(response as never); jest.mocked(gstPreparationApi.saveCompany).mockResolvedValue({ id: 'company-draft' } as never); jest.mocked(gstPreparationApi.get).mockResolvedValue({ id: 'company-draft', status: 'draft' } as never); });
it('requires explicit company/rate confirmation then displays the server 850 profit and 238 tax and reloads a draft', async () => {
  const screen = render(<CompanyTaxPanel />);
  fireEvent.press(screen.getByText('Prepare company income tax'));
  expect(gstPreparationApi.company).not.toHaveBeenCalled();
  fireEvent(screen.getByLabelText('Confirm NZ company and 28% tax rate'), 'valueChange', true);
  fireEvent.press(screen.getByText('Prepare company income tax'));
  expect(await screen.findByText('Accounting profit: $850.00')).toBeTruthy();
  expect(screen.getByText('Income tax payable: $238.00')).toBeTruthy();
  fireEvent.press(screen.getByText('Save company tax draft'));
  expect(await screen.findByText('Saved company tax return: draft')).toBeTruthy();
  expect(gstPreparationApi.get).toHaveBeenCalledWith('company-draft');
});
it('invalidates prepared company tax when losses change and shows a retryable server error', async () => {
  const screen = render(<CompanyTaxPanel />);
  fireEvent(screen.getByLabelText('Confirm NZ company and 28% tax rate'), 'valueChange', true);
  fireEvent.press(screen.getByText('Prepare company income tax'));
  await screen.findByText('Income tax payable: $238.00');
  fireEvent.changeText(screen.getByLabelText('Tax losses brought forward'), '100.00');
  expect(screen.queryByText('Income tax payable: $238.00')).toBeNull();
  jest.mocked(gstPreparationApi.company).mockRejectedValue(new Error('Company tax unavailable'));
  fireEvent.press(screen.getByText('Prepare company income tax'));
  expect(await screen.findByText('Company tax unavailable')).toBeTruthy();
});

it('reloads the saved company worksheet146 with losses/credits and requires confirmation before updating it',async()=>{
 const worksheet={...response,adjustments:[{kind:'add_back',amount:'100.00',reason:'Reviewed non-deductible expense',sourceReference:'ADD-001'},{kind:'deduction',amount:'50.00',reason:'Reviewed tax deduction',sourceReference:'DED-001'}],lossesBroughtForward:'200.00',taxCredits:'50.00',taxableIncome:'700.00',incomeTax:'196.00',incomeTaxPayable:'146.00'};
 jest.mocked(gstPreparationApi.companyDrafts).mockResolvedValue([{id:'saved-company',periodStart:worksheet.from,periodEnd:worksheet.to,status:'draft',updatedAt:'2026-11-06T00:00:00Z',returnData:{companyIncomeTax:worksheet}}] as never);
 const screen=render(<CompanyTaxPanel/>);fireEvent.press(screen.getByText('Load saved company tax drafts'));fireEvent.press(await screen.findByText(`Load company tax draft ${worksheet.from} to ${worksheet.to}`));
 expect(await screen.findByText('Income tax payable: $146.00')).toBeTruthy();expect(screen.getByLabelText('Tax losses brought forward').props.value).toBe('200.00');expect(screen.getByLabelText('Company tax credits').props.value).toBe('50.00');
 fireEvent.press(screen.getByText('Save company tax draft'));expect(gstPreparationApi.saveCompany).not.toHaveBeenCalled();
});
