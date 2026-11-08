import { invoiceSchema, stripePaymentLinkSchema } from '@ledgercraft/contracts';
import { describe, expect, it } from 'vitest';
import { withTestDb } from '../../test/harness';
import { processVerifiedWebhook } from './stripe.service';
import { stripeFixture as fixture } from './stripe.test-fixture';
const headers = { Origin: 'http://localhost:8080', 'Content-Type': 'application/json' };

describe('Stripe finance operations', () => {
  it('re-retrieves authoritative payment and rejects a signed event when remote destination is different', async () => withTestDb(async () => {
    const f = await fixture();
    try {
      const event = f.gateway.completeCheckout(f.row.stripe_checkout_session_id as string);
      const remote = await f.gateway.retrieveCheckoutPayment!(f.row.stripe_checkout_session_id as string);
      f.gateway.retrieveCheckoutPayment = async () => ({ ...remote, destinationAccountId: 'acct_other' });
      await expect(processVerifiedWebhook(f.db, event, f.gateway, f.config)).rejects.toThrow(/integrity|match/i);
      expect(await f.sql.unsafe('SELECT id FROM payments')).toHaveLength(0);
    } finally { await f.sql.end(); }
  }));

  it('verifies exact payment without changing money; full refund reverses payment and fee once after remote confirmation', async () => withTestDb(async () => {
    const f = await fixture();
    try {
      const event = f.gateway.completeCheckout(f.row.stripe_checkout_session_id as string);
      await processVerifiedWebhook(f.db, event, f.gateway, f.config);
      const paid = stripePaymentLinkSchema.parse(await (await f.call(`/api/invoices/${f.invoice.id}/payment-links/${f.link.id}`)).json());
      const verify = await f.call(`/api/payments/${paid.paymentId}/stripe/verify`, {});
      expect(verify.status, await verify.clone().text()).toBe(200);
      expect(await verify.json()).toMatchObject({ result: 'match', differences: [] });
      const refund = await f.call(`/api/payments/${paid.paymentId}/stripe/refund`, { reason: 'Customer requested full refund' }, 'refund1');
      expect(refund.status, await refund.clone().text()).toBe(202);
      expect((await f.sql.unsafe('SELECT status FROM payments'))[0].status).toBe('completed');
      const refundEvent = { ...event, id: 'evt_refund_1', type: 'charge.refunded', data: { object: { payment_intent: `pi_mock_${f.row.stripe_checkout_session_id}` } } };
      await processVerifiedWebhook(f.db, refundEvent, f.gateway, f.config);
      await processVerifiedWebhook(f.db, refundEvent, f.gateway, f.config);
      expect((await f.sql.unsafe('SELECT status FROM payments'))[0].status).toBe('refunded');
      expect(invoiceSchema.parse(await (await f.call(`/api/invoices/${f.invoice.id}`)).json()).balanceDue).toBe('100.00');
      expect(await f.sql.unsafe("SELECT id FROM journal_entries WHERE reference_type = 'stripe_platform_fee'")).toHaveLength(1);
      expect(await f.sql.unsafe("SELECT id FROM journal_entries WHERE reference_type = 'stripe_platform_fee_reversal'")).toHaveLength(1);
    } finally { await f.sql.end(); }
  }));

  it('ignores duplicate success through different event types and stops paid invoice links', async () => withTestDb(async () => {
    const f = await fixture();
    try {
      const event = f.gateway.completeCheckout(f.row.stripe_checkout_session_id as string);
      await processVerifiedWebhook(f.db, event, f.gateway, f.config);
      await processVerifiedWebhook(f.db, { ...event, id: 'evt_pi_duplicate', type: 'payment_intent.succeeded', data: { object: { id: `pi_mock_${f.row.stripe_checkout_session_id}` } } }, f.gateway, f.config);
      expect(await f.sql.unsafe('SELECT id FROM payments')).toHaveLength(1);
      expect((await f.app.request(`/api/public/pay/${f.row.public_token}`)).status).toBe(410);
      const disabled = { ...f.config, enabled: false };
      await processVerifiedWebhook(f.db, { ...event, id: 'evt_inflight_after_kill' }, f.gateway, disabled);
      expect(await f.sql.unsafe('SELECT id FROM payments')).toHaveLength(1);
    } finally { await f.sql.end(); }
  }));

  it('expires an open link after a manual payment changes its balance', async () => withTestDb(async () => {
    const f = await fixture();
    try {
      await f.call('/api/payments', { invoiceId: f.invoice.id, amount: '25.00', paymentMethod: 'cash', paymentDate: '2026-11-07' });
      const response = await f.app.request(`/api/public/pay/${f.row.public_token}`);
      expect(response.status).toBe(410);
      expect(await response.json()).toMatchObject({ status: 'cancelled' });
    } finally { await f.sql.end(); }
  }));

  it('requires owner/admin on every operational route and isolates another company', async () => withTestDb(async () => {
    const f = await fixture();
    try {
      await processVerifiedWebhook(f.db, f.gateway.completeCheckout(f.row.stripe_checkout_session_id as string), f.gateway, f.config);
      const paid = stripePaymentLinkSchema.parse(await (await f.call(`/api/invoices/${f.invoice.id}/payment-links/${f.link.id}`)).json());
      for (const role of ['owner', 'admin', 'accountant', 'member', 'read_only']) {
        await f.sql.unsafe('UPDATE organisation_memberships SET role = ? WHERE organisation_id = ?', [role, f.row.organisation_id]);
        const allowed = role === 'owner' || role === 'admin';
        for (const path of ['/api/payments/stripe/balance', '/api/payments/stripe/operations', '/api/payments/stripe/settlements']) expect((await f.call(path)).status).toBe(allowed ? 200 : 403);
        expect((await f.call(`/api/payments/${paid.paymentId}/stripe/verify`, {})).status).toBe(allowed ? 200 : 403);
        // Invalid input still reaches validation only for an authorised owner/admin.
        expect((await f.call(`/api/payments/${paid.paymentId}/stripe/refund`, { reason: 'x' }, 'role-refund')).status).toBe(allowed ? 400 : 403);
      }
      const signup = await f.app.request('/api/auth/sign-up/email', { method: 'POST', headers, body: JSON.stringify({name:'Other company owner',email:`other-${crypto.randomUUID()}@example.test`,password:'Local-password123'}) });
      const cookie = signup.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
      expect((await f.app.request(`/api/payments/${paid.paymentId}/stripe/verify`, {method:'POST',headers:{...headers,Cookie:cookie},body:'{}'})).status).toBe(404);
    } finally { await f.sql.end(); }
  }));

  it('rejects a refund before contacting Stripe when an active credit requires reviewed allocation', async () => withTestDb(async () => {
    const f = await fixture();
    try {
      await processVerifiedWebhook(f.db, f.gateway.completeCheckout(f.row.stripe_checkout_session_id as string), f.gateway, f.config);
      const paid = stripePaymentLinkSchema.parse(await (await f.call(`/api/invoices/${f.invoice.id}/payment-links/${f.link.id}`)).json());
      const credit = await f.call('/api/credit-notes', {invoiceId:f.invoice.id,issueDate:new Date().toISOString().slice(0,10),reason:'Customer return credit issued',taxInclusive:false,taxRate:'0',items:[{description:'Returned consulting',quantity:'1',rate:'100'}]},'credit-first');
      expect(credit.status,await credit.clone().text()).toBe(201);
      let calls = 0; f.gateway.createFullRefund = async () => { calls++; return {id:'re_should_not_send',status:'succeeded'}; };
      expect((await f.call(`/api/payments/${paid.paymentId}/stripe/refund`, {reason:'Customer requested full refund'}, 'credit-refund')).status).toBe(409);
      expect(calls).toBe(0);
    } finally { await f.sql.end(); }
  }));

  it('resolves a genuine application fee event through its charge and reverses the returned fee exactly once', async () => withTestDb(async () => {
    const f = await fixture();
    try {
      const success = f.gateway.completeCheckout(f.row.stripe_checkout_session_id as string);
      await processVerifiedWebhook(f.db, success, f.gateway, f.config);
      const intent = `pi_mock_${f.row.stripe_checkout_session_id}`;
      await f.gateway.createFullRefund!(intent, 'fee-ordering-refund');
      const returned = await f.gateway.retrievePayment!(intent);
      f.gateway.retrievePayment = async () => ({ ...returned, applicationFeeRefundedCents: 0 });
      await processVerifiedWebhook(f.db, {...success,id:'evt_charge_refund_before_fee',type:'charge.refunded',data:{object:{id:'ch_local',payment_intent:intent}}},f.gateway,f.config);
      expect(await f.sql.unsafe("SELECT id FROM journal_entries WHERE reference_type = 'stripe_platform_fee_reversal'")).toHaveLength(0);
      f.gateway.retrieveFeePayment = async () => returned;
      const feeEvent = {...success,id:'evt_real_application_fee_refunded',type:'application_fee.refunded',data:{object:{id:'fee_local',object:'application_fee',charge:'ch_local',amount:430,amount_refunded:430}}};
      await processVerifiedWebhook(f.db,feeEvent,f.gateway,f.config);
      await processVerifiedWebhook(f.db,feeEvent,f.gateway,f.config);
      expect(await f.sql.unsafe("SELECT id FROM journal_entries WHERE reference_type = 'stripe_platform_fee_reversal'")).toHaveLength(1);
      expect((await (await f.call('/api/payments/stripe/balance')).json() as {ledgerClearing:string}).ledgerClearing).toBe('0.00');
    } finally { await f.sql.end(); }
  }));

  it('does not reverse a customer payment when only its application fee was returned', async () => withTestDb(async () => {
    const f = await fixture();
    try {
      const event = f.gateway.completeCheckout(f.row.stripe_checkout_session_id as string);
      await processVerifiedWebhook(f.db,event,f.gateway,f.config);
      const remote = await f.gateway.retrieveCheckoutPayment!(f.row.stripe_checkout_session_id as string);
      f.gateway.retrieveFeePayment = async () => ({...remote, applicationFeeRefundedCents:remote.platformFeeCents});
      await processVerifiedWebhook(f.db,{...event,id:'evt_fee_only',type:'application_fee.refunded',data:{object:{id:'fee_only',charge:'ch_only',amount_refunded:430}}},f.gateway,f.config);
      expect((await f.sql.unsafe('SELECT status FROM payments'))[0].status).toBe('completed');
      expect(invoiceSchema.parse(await (await f.call(`/api/invoices/${f.invoice.id}`)).json()).balanceDue).toBe('0.00');
      expect((await (await f.call('/api/payments/stripe/balance')).json() as {ledgerClearing:string}).ledgerClearing).toBe('100.00');
    } finally { await f.sql.end(); }
  }));

  it('reports an externally partial refund as a mismatch rather than a matching completed payment',async()=>withTestDb(async()=>{
    const f=await fixture();try{
      await processVerifiedWebhook(f.db,f.gateway.completeCheckout(String(f.row.stripe_checkout_session_id)),f.gateway,f.config);
      const paid=stripePaymentLinkSchema.parse(await(await f.call(`/api/invoices/${f.invoice.id}/payment-links/${f.link.id}`)).json());
      const remote=await f.gateway.retrievePayment!(`pi_mock_${f.row.stripe_checkout_session_id}`);f.gateway.retrievePayment=async()=>({...remote,refundedCents:1500});
      const verification=await f.call(`/api/payments/${paid.paymentId}/stripe/verify`,{});
      expect(await verification.json()).toMatchObject({result:'mismatch',differences:expect.arrayContaining(['partial_refund'])});
    }finally{await f.sql.end();}
  }));

  it('returns connected balances and records provider mismatches without silently correcting books', async () => withTestDb(async () => {
    const f = await fixture();
    try {
      await processVerifiedWebhook(f.db, f.gateway.completeCheckout(f.row.stripe_checkout_session_id as string), f.gateway, f.config);
      const paid = stripePaymentLinkSchema.parse(await (await f.call(`/api/invoices/${f.invoice.id}/payment-links/${f.link.id}`)).json());
      const balance = await f.call('/api/payments/stripe/balance');
      expect(balance.status).toBe(200);
      expect(await balance.json()).toMatchObject({ currency: 'NZD', available: '95.70', pending: '0.00', ledgerClearing: '95.70', difference: '0.00' });
      await f.sql.unsafe("UPDATE payments SET amount = '90.00' WHERE id = ?", [paid.paymentId]);
      const verify = await f.call(`/api/payments/${paid.paymentId}/stripe/verify`, {});
      expect(await verify.json()).toMatchObject({ result: 'mismatch', differences: expect.arrayContaining(['amount']) });
      expect((await f.sql.unsafe('SELECT amount FROM payments'))[0].amount).toBe('90.00');
    } finally { await f.sql.end(); }
  }));
});
