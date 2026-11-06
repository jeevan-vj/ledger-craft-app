import { gstPreparationApi } from './gstPreparationApi';
import { apiRequest } from '@/features/auth/api/http';
jest.mock('@/features/auth/api/http', () => ({ apiRequest: jest.fn() }));
const figures = { basis:'invoice' as const,from:'2026-04-01',to:'2026-04-30',baseCurrency:'NZD' as const,totalSales:'1610.00',totalPurchases:'625.00',gstOnSales:'195.00',gstOnPurchases:'78.00',netGstPosition:'117.00',warnings:[],review:{confirmed:true as const,reviewedAt:'2026-05-01T00:00:00.000Z',reviewedBy:'owner',adjustments:[{kind:'output' as const,amount:'-15.00',reason:'Reviewed credit correction',sourceReference:'CN-001'}],unadjustedGstOnSales:'210.00',unadjustedGstOnPurchases:'75.00'} };
it('retries a lost GST draft response with the same key and exact original review timestamp payload', async()=>{
 jest.mocked(apiRequest).mockRejectedValueOnce(new Error('Lost response')).mockResolvedValueOnce({id:'one-draft'});
 await expect(gstPreparationApi.save(figures)).rejects.toThrow('Lost response');
 await gstPreparationApi.save({...figures,review:{...figures.review,reviewedAt:'2026-05-01T00:01:00.000Z'}});
 const first=jest.mocked(apiRequest).mock.calls[0][1],second=jest.mocked(apiRequest).mock.calls[1][1];
 expect(first?.headers).toEqual(expect.objectContaining({'Idempotency-Key':expect.any(String)}));expect(second?.headers).toEqual(first?.headers);expect(second?.body).toBe(first?.body);
 expect(JSON.parse(second?.body as string).returnData.gstReview.reviewedAt).toBe('2026-05-01T00:00:00.000Z');
});
