import { afterEach,expect,it,vi } from 'vitest';
import { accountsApi } from './paymentsApi';
afterEach(()=>vi.unstubAllGlobals());
it('retains the caller account-creation key across a safe retry',async()=>{
 const fetcher=vi.fn(async(_path:RequestInfo|URL,_init?:RequestInit)=>new Response(JSON.stringify({id:'11111111-1111-4111-8111-111111111111',name:'Capital',type:'custom',currency:'NZD',openingBalance:'0.00',currentBalance:'0.00',accountNumber:'3000',accountClass:'equity',isActive:true}),{status:201}));vi.stubGlobal('fetch',fetcher);
 await accountsApi.create({name:'Capital',type:'custom',accountClass:'equity',accountNumber:'3000'},'chart-create-key');expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('Idempotency-Key')).toBe('chart-create-key');
});

it('binds new account setup to the company reviewed by the user',async()=>{
 const fetcher=vi.fn(async(_path:RequestInfo|URL,_init?:RequestInit)=>new Response(JSON.stringify({id:'11111111-1111-4111-8111-111111111111',name:'Capital',type:'custom',currency:'NZD',openingBalance:'0.00',currentBalance:'0.00',accountNumber:'3000',accountClass:'equity',isActive:true}),{status:201}));vi.stubGlobal('fetch',fetcher);
 await accountsApi.create({name:'Capital',type:'custom'},'key','reviewed-company');expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('X-Expected-Organisation-ID')).toBe('reviewed-company');
});
