import {reportsApi} from './reportsApi';
import {apiRequest} from '@/features/auth/api/http';
jest.mock('@/features/auth/api/http',()=>({apiRequest:jest.fn()}));
it('validates report DTOs and forwards comparison, columns and account filters',async()=>{
 (apiRequest as jest.Mock).mockResolvedValue({meta:{}});
 await expect(reportsApi.financial({from:'2026-04-01',to:'2026-04-30',basis:'cash',baseCurrency:'NZD',columns:'month',comparisonFrom:'2025-04-01',comparisonTo:'2025-04-30',accountIds:['11111111-1111-4111-8111-111111111111']})).rejects.toThrow();
 expect(apiRequest).toHaveBeenCalledWith(expect.stringContaining('columns=month'),{method:'GET'});
 expect(apiRequest).toHaveBeenCalledWith(expect.stringContaining('accountIds=11111111-1111-4111-8111-111111111111'),{method:'GET'});
});
