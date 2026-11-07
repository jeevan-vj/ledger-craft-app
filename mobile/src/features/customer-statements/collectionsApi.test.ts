import { collectionsApi } from './collectionsApi';
import { apiRequest } from '@/features/auth/api/http';
jest.mock('@/features/auth/api/http',()=>({apiRequest:jest.fn()}));
beforeEach(()=>jest.clearAllMocks());
it('preserves stable send keys and rejects a false successful delivery',async()=>{jest.mocked(apiRequest).mockResolvedValue({sent:true,token:'token',url:'https://example.test/shared/statement/token',expiresAt:'2026-11-14T00:00:00.000Z'});await collectionsApi.send('customer',{type:'activity',from:'2026-10-01',to:'2026-10-31'},'retry-key');expect(apiRequest).toHaveBeenCalledWith('/api/customers/customer/statement/send',expect.objectContaining({headers:{'Idempotency-Key':'retry-key'}}));jest.mocked(apiRequest).mockResolvedValue({sent:false});await expect(collectionsApi.send('customer',{type:'activity',from:'2026-10-01',to:'2026-10-31'},'retry-key')).rejects.toThrow();});
it('does not request a malformed period or mutate settings without validation',async()=>{await expect(collectionsApi.statement('customer',{type:'activity',from:'2026-10-32',to:'2026-10-31'})).rejects.toThrow();expect(apiRequest).not.toHaveBeenCalled();});
