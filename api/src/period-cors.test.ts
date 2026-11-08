import { expect, it } from 'vitest';
import { createApp } from './app';
it('allows the reviewed company assertion on browser period mutations',async()=>{
 const r=await createApp().request('/api/accounting-periods/close',{method:'OPTIONS',headers:{Origin:'http://localhost:8080','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type,x-expected-organisation-id'}});
 expect(r.status).toBe(204);expect(r.headers.get('access-control-allow-headers')?.toLowerCase()).toContain('x-expected-organisation-id');
});
