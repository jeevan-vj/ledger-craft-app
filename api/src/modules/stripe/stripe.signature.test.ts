import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createStripeGateway } from './stripe.real-gateway';
const secret='whsec_local_signature_fixture';
const payload=JSON.stringify({id:'evt_signature_fixture',type:'payment_intent.succeeded',livemode:false,account:null,data:{object:{id:'pi_local'}}});
const signed=(time:number)=>`t=${time},v1=${createHmac('sha256',secret).update(`${time}.${payload}`).digest('hex')}`;
describe('actual Stripe SDK signature boundary',()=>{
 it('accepts a current valid raw-body signature and rejects wrong or stale signatures',async()=>{
  const gateway=createStripeGateway('sk_test_local_signature_fixture');const bytes=new TextEncoder().encode(payload);const now=Math.floor(Date.now()/1000);
  expect((await gateway.constructWebhookEvent(bytes,signed(now),secret)).id).toBe('evt_signature_fixture');
  await expect(gateway.constructWebhookEvent(bytes,signed(now-301),secret)).rejects.toThrow();
  await expect(gateway.constructWebhookEvent(bytes,`t=${now},v1=wrong`,secret)).rejects.toThrow();
  await expect(gateway.constructWebhookEvent(new TextEncoder().encode(payload+' '),signed(now),secret)).rejects.toThrow();
 });
});
