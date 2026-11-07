import { describe, expect, it } from 'vitest';
import { withTestDb } from '../../test/harness';
import { stripeFixture } from './stripe.test-fixture';
import { processVerifiedWebhook } from './stripe.service';

describe('Stripe beta approval, rate limits and periodic verification', () => {
 it('denies new real-mode links by default and permits only the explicitly approved organisation', async()=>withTestDb(async()=>{
  const f=await stripeFixture();try{
   f.config.mock=false;f.config.approvedOrganisationIds=[];
   expect(await (await f.call('/api/payments/stripe/account')).json()).toMatchObject({paymentsApproved:false});
   expect((await f.app.request(`/api/public/pay/${f.row.public_token}`)).status).toBe(410);
   const denied=await f.call(`/api/invoices/${f.invoice.id}/payment-links`,{amount:'50.00'},'unapproved');expect(denied.status).toBe(403);
   f.config.approvedOrganisationIds=[String(f.row.organisation_id)];
   expect(await (await f.call('/api/payments/stripe/account/refresh',{})).json()).toMatchObject({paymentsApproved:true});
   expect((await f.call(`/api/invoices/${f.invoice.id}/payment-links`,{amount:'50.00'},'approved')).status).toBe(201);
  }finally{await f.sql.end();}
 }));
 it('persists limit counts, isolates scopes and resets only after the window',async()=>withTestDb(async({db})=>{
  const { consumeStripeRateLimit } = await import('./stripe.rate-limits');
  const now=new Date('2026-11-07T01:00:00Z');
  await consumeStripeRateLimit(db,'fixture','org-one',2,60_000,now);
  await consumeStripeRateLimit(db,'fixture','org-one',2,60_000,now);
  await expect(consumeStripeRateLimit(db,'fixture','org-one',2,60_000,now)).rejects.toMatchObject({status:429});
  await expect(consumeStripeRateLimit(db,'fixture','org-two',2,60_000,now)).resolves.toBeUndefined();
  await expect(consumeStripeRateLimit(db,'fixture','org-one',2,60_000,new Date(now.getTime()+60_000))).resolves.toBeUndefined();
 }));
 it('limits actual link/redirect/webhook flows while replayed successful requests remain available',async()=>withTestDb(async()=>{
  const {consumeStripeRateLimit}=await import('./stripe.rate-limits');
  const f=await stripeFixture();try{
   for(let i=0;i<9;i++)expect((await f.call(`/api/invoices/${f.invoice.id}/payment-links`,{amount:'1.00'},`limit-${i}`)).status).toBe(201);
   expect((await f.call(`/api/invoices/${f.invoice.id}/payment-links`,{amount:'1.00'},'limit-over')).status).toBe(429);
   expect((await f.call(`/api/invoices/${f.invoice.id}/payment-links`,{},'link')).status).toBe(201);
   for(let i=0;i<60;i++)expect((await f.app.request(`/api/public/pay/${f.row.public_token}`)).status).toBe(302);
   expect((await f.app.request(`/api/public/pay/${f.row.public_token}`)).status).toBe(429);
   await consumeStripeRateLimit(f.db,'verified-webhook','stripe',1000,60_000);
   const {hashIdempotencyPayload}=await import('../invoices/idempotency');const key=hashIdempotencyPayload(['verified-webhook','stripe']);
   await f.sql.unsafe('UPDATE stripe_rate_limits SET count=1000 WHERE key=?',[key]);
   const event=f.gateway.completeCheckout(String(f.row.stripe_checkout_session_id));
   await expect(processVerifiedWebhook(f.db,event,f.gateway,f.config)).rejects.toMatchObject({status:429});
   await f.sql.unsafe('UPDATE stripe_rate_limits SET window_started_at=? WHERE key=?',[Date.now()-61_000,key]);
   await processVerifiedWebhook(f.db,event,f.gateway,f.config);
   await f.sql.unsafe('UPDATE stripe_rate_limits SET count=1000 WHERE key=?',[key]);
   await expect(processVerifiedWebhook(f.db,event,f.gateway,f.config)).resolves.toEqual({received:true});
  }finally{await f.sql.end();}
 }));
 it('discovers a missing provider payment and records mismatches without posting or duplicating a daily run',async()=>withTestDb(async()=>{
  const { runStripeVerification, nextStripeVerificationTime } = await import('./stripe.verification');
  const f=await stripeFixture();try{
   const event=f.gateway.completeCheckout(String(f.row.stripe_checkout_session_id));
   const now=new Date();
   const before=await f.sql.unsafe('SELECT id FROM payments');expect(before).toHaveLength(0);
   const first=await runStripeVerification(f.db,f.gateway,f.config,now);expect(first.checkedPayments).toBe(1);expect(first.mismatches).toBeGreaterThan(0);
   expect(await f.sql.unsafe('SELECT id FROM payments')).toHaveLength(0);
   expect((await f.call('/api/payments/stripe/operations')).status).toBe(200);
   const second=await runStripeVerification(f.db,f.gateway,f.config,now);expect(second.checkedOrganisations).toBe(0);
   expect((await nextStripeVerificationTime(f.db,now))!).toBeGreaterThan(now.getTime());
   await processVerifiedWebhook(f.db,event,f.gateway,f.config);
   const tomorrow=new Date(now.getTime()+86_400_000);
   const after=await runStripeVerification(f.db,f.gateway,f.config,tomorrow);expect(after.checkedPayments).toBe(1);expect(after.mismatches).toBe(0);
  }finally{await f.sql.end();}
 }));
 it('records unavailable provider checks and incomplete discovery honestly with bounded retry',async()=>withTestDb(async()=>{
  const { runStripeVerification, nextStripeVerificationTime } = await import('./stripe.verification');
  const f=await stripeFixture();try{
   f.gateway.listRecentPayments=async()=>({items:[],complete:false});
   const now=new Date();const incomplete=await runStripeVerification(f.db,f.gateway,f.config,now);expect(incomplete.mismatches).toBeGreaterThan(0);
   expect((await f.sql.unsafe("SELECT differences FROM stripe_verifications WHERE kind='daily_discovery'"))[0].differences).toContain('incomplete_provider_window');
   f.gateway.listRecentPayments=async()=>{throw new Error('Provider unavailable');};
   const later=new Date(now.getTime()+86_400_000);const failure=await runStripeVerification(f.db,f.gateway,f.config,later);expect(failure.unavailable).toBe(1);
   const next=await nextStripeVerificationTime(f.db,later);expect(next).toBeGreaterThan(later.getTime());expect(next).toBeLessThanOrEqual(later.getTime()+3_600_000);
  }finally{await f.sql.end();}
 }));
});
