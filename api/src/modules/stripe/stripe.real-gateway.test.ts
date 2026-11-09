import { beforeEach, describe, expect, it, vi } from 'vitest';

const stripeMocks = vi.hoisted(() => ({
  constructed: vi.fn(),
  fetchMakeRequest: vi.fn(),
  v1AccountCreate: vi.fn(),
  v2AccountCreate: vi.fn(),
  feeRetrieve: vi.fn(), chargeRetrieve: vi.fn(), intentRetrieve: vi.fn(), intentList: vi.fn(),
}));

vi.mock('stripe', () => {
  class StripeMock {
    static createFetchHttpClient = vi.fn(() => ({ makeRequest: stripeMocks.fetchMakeRequest }));
    static createSubtleCryptoProvider = vi.fn(() => ({}));
    constructor(secretKey: string, config: unknown) { stripeMocks.constructed(secretKey, config); }

    accounts = { create: stripeMocks.v1AccountCreate };
    accountLinks = { create: vi.fn() };
    applicationFees = { retrieve: stripeMocks.feeRetrieve };
    charges = { retrieve: stripeMocks.chargeRetrieve };
    paymentIntents = { retrieve: stripeMocks.intentRetrieve, list: stripeMocks.intentList };
    checkout = { sessions: { create: vi.fn(), expire: vi.fn() } };
    webhooks = { constructEventAsync: vi.fn() };
    v2 = {
      core: {
        accounts: {
          create: stripeMocks.v2AccountCreate,
          retrieve: vi.fn(),
        },
        accountLinks: { create: vi.fn() },
      },
    };
  }

  return { default: StripeMock };
});

import { createStripeGateway, stripePaymentsCapability, stripeRuntimeFromEnv } from './stripe.real-gateway';

describe('real Stripe gateway', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stripeMocks.v2AccountCreate.mockResolvedValue({
      id: 'acct_test_v2',
      configuration: {
        merchant: { capabilities: { card_payments: { status: 'pending', status_details: [] } } },
        recipient: { capabilities: { stripe_balance: { payouts: { status: 'pending', status_details: [] } } } },
      },
      requirements: { entries: [] },
    });
  });

  it('creates a Stripe-responsible Accounts v2 connected account', async () => {
    const gateway = createStripeGateway('rk_test_example');

    await gateway.createConnectedAccount({
      country: 'NZ',
      organisationId: 'org_123',
      businessName: 'Kauri Studio Test Ltd',
      email: 'owner@example.com',
      idempotencyKey: 'connect-account-1',
    });

    expect(stripeMocks.v1AccountCreate).not.toHaveBeenCalled();
    expect(stripeMocks.v2AccountCreate).toHaveBeenCalledWith(expect.objectContaining({
      contact_email: 'owner@example.com',
      dashboard: 'full',
      defaults: expect.objectContaining({
        currency: 'nzd',
        responsibilities: {
          fees_collector: 'stripe',
          losses_collector: 'stripe',
        },
      }),
      identity: { country: 'NZ' },
      metadata: { organisation_id: 'org_123' },
    }), { idempotencyKey: 'connect-account-1' });
  });

  it.each([
    [{}, 'unavailable'],
    [{ STRIPE_PAYMENTS_ENABLED: 'TRUE' }, 'unavailable'],
    [{ STRIPE_PAYMENTS_ENABLED: 'true' }, 'unavailable'],
    [{ STRIPE_PAYMENTS_ENABLED: 'true', STRIPE_SECRET_KEY: 'sk_test_example', STRIPE_WEBHOOK_SECRET: 'whsec_platform' }, 'unavailable'],
    [{ STRIPE_PAYMENTS_ENABLED: 'true', STRIPE_SECRET_KEY: 'sk_test_example', STRIPE_WEBHOOK_SECRET: 'whsec_platform', STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_connect' }, 'available'],
    [{ STRIPE_PAYMENTS_ENABLED: 'true', STRIPE_SECRET_KEY: 'oak_live_example', STRIPE_CONTEXT: 'acct_sandbox', STRIPE_WEBHOOK_SECRET: 'whsec_platform', STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_connect', APP_URL: 'http://localhost:8080' }, 'available'],
    [{ STRIPE_PAYMENTS_ENABLED: 'true', STRIPE_SECRET_KEY: 'oak_live_example', STRIPE_WEBHOOK_SECRET: 'whsec_platform', STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_connect', APP_URL: 'http://localhost:8080' }, 'unavailable'],
    [{ STRIPE_PAYMENTS_ENABLED: 'true', STRIPE_SECRET_KEY: 'oak_live_example', STRIPE_CONTEXT: 'acct_sandbox', STRIPE_WEBHOOK_SECRET: 'whsec_platform', STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_connect', APP_URL: 'https://example.com' }, 'unavailable'],
    [{ STRIPE_PAYMENTS_ENABLED: 'true', STRIPE_SECRET_KEY: 'oak_live_example', STRIPE_CONTEXT: 'acct_sandbox', STRIPE_WEBHOOK_SECRET: 'whsec_platform', STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_connect', APP_URL: 'http://localhost:8080', NODE_ENV: 'production' }, 'unavailable'],
    [{ STRIPE_PAYMENTS_ENABLED: 'true', STRIPE_MOCK_MODE: 'true', APP_URL: 'http://localhost:8080' }, 'available'],
    [{ STRIPE_PAYMENTS_ENABLED: 'true', STRIPE_MOCK_MODE: 'true', APP_URL: 'https://example.com' }, 'unavailable'],
    [{ STRIPE_PAYMENTS_ENABLED: 'true', STRIPE_MOCK_MODE: 'true', APP_URL: 'http://localhost:8080', NODE_ENV: 'production' }, 'unavailable'],
  ])('reports Stripe capability without exposing configuration (%#)', (env, expected) => {
    expect(stripePaymentsCapability(env)).toBe(expected);
  });

  it('fails closed without crashing when enabled real-mode configuration is incomplete', () => {
    expect(stripeRuntimeFromEnv({ STRIPE_PAYMENTS_ENABLED: 'true' })).toBeUndefined();
  });
});

it('retains a configured webhook receiver when the new-payment kill switch is off', () => {
  const runtime = stripeRuntimeFromEnv({ STRIPE_PAYMENTS_ENABLED: 'false', STRIPE_SECRET_KEY: 'sk_test_example', STRIPE_WEBHOOK_SECRET: 'whsec_platform', STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_connect' });
  expect(runtime?.config.enabled).toBe(false);
  expect(runtime?.gateway.constructWebhookEvent).toBeTypeOf('function');
  expect(stripePaymentsCapability({ STRIPE_PAYMENTS_ENABLED: 'false' })).toBe('unavailable');
});

it('does not enable a disabled local mock through real webhook credentials', () => {
 expect(stripeRuntimeFromEnv({STRIPE_PAYMENTS_ENABLED:'false',STRIPE_MOCK_MODE:'true',APP_URL:'http://localhost:8080',STRIPE_SECRET_KEY:'sk_test_example',STRIPE_WEBHOOK_SECRET:'whsec_test',STRIPE_CONNECT_WEBHOOK_SECRET:'whsec_test'})).toBeUndefined();
});

it('retrieves a real-shaped ApplicationFee through its charge before reading authoritative payment facts', async () => {
 stripeMocks.feeRetrieve.mockResolvedValue({id:'fee_sdk',charge:'ch_sdk'});
 stripeMocks.chargeRetrieve.mockResolvedValue({id:'ch_sdk',payment_intent:'pi_sdk'});
 stripeMocks.intentRetrieve.mockResolvedValue({id:'pi_sdk',status:'succeeded',currency:'nzd',amount_received:10000,application_fee_amount:430,transfer_data:{destination:'acct_sdk'},metadata:{organisation_id:'org_sdk',payment_link_id:'link_sdk'},latest_charge:{amount_refunded:10000,application_fee:{amount_refunded:430}}});
 const remote=await createStripeGateway('sk_test_fixture').retrieveFeePayment!('fee_sdk');
 expect(remote).toMatchObject({id:'pi_sdk',amountCents:10000,applicationFeeRefundedCents:430,destinationAccountId:'acct_sdk'});
 expect(stripeMocks.feeRetrieve).toHaveBeenCalledWith('fee_sdk');expect(stripeMocks.chargeRetrieve).toHaveBeenCalledWith('ch_sdk');expect(stripeMocks.intentRetrieve).toHaveBeenCalledWith('pi_sdk',{expand:['latest_charge.application_fee']});
});

it('paginates the last48h provider window, retaining only the destination or declared organisation for audit',async()=>{
 stripeMocks.intentList.mockReset();
 const intent=(id:string,org:string,destination:string)=>({id,status:'succeeded',currency:'nzd',amount_received:10000,application_fee_amount:430,metadata:{organisation_id:org,payment_link_id:'link1'},transfer_data:{destination}});
 stripeMocks.intentList.mockResolvedValueOnce({data:[intent('pi_foreign','org_other','acct_other')],has_more:true}).mockResolvedValueOnce({data:[intent('pi_scoped','org_target','acct_target'),intent('pi_wrongroute','org_target','acct_wrong')],has_more:false});
 const since=new Date('2026-11-05T00:00:00Z');const result=await createStripeGateway('sk_test_fixture').listRecentPayments!('org_target','acct_target',since);
 expect(result.complete).toBe(true);expect(result.items.map(item=>item.id)).toEqual(['pi_scoped','pi_wrongroute']);expect(stripeMocks.intentList).toHaveBeenNthCalledWith(2,expect.objectContaining({starting_after:'pi_foreign',created:{gte:Math.floor(since.getTime()/1000)}}));
});
it('reports incomplete provider discovery when Stripe pagination cannot establish a complete window',async()=>{
 stripeMocks.intentList.mockReset();stripeMocks.intentList.mockResolvedValue({data:[],has_more:true});
 expect(await createStripeGateway('sk_test_fixture').listRecentPayments!('org_target','acct_target',new Date())).toEqual({items:[],complete:false});
 expect(stripeMocks.intentList).toHaveBeenCalledTimes(1);
});
it('sends the sandbox context for a local CLI token and keeps the mode in test', async () => {
  const env = { STRIPE_PAYMENTS_ENABLED: 'true', STRIPE_SECRET_KEY: 'oak_live_example', STRIPE_CONTEXT: 'acct_sandbox', STRIPE_WEBHOOK_SECRET: 'whsec_platform', STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_connect', APP_URL: 'http://localhost:8080' };
  expect(stripeRuntimeFromEnv(env)?.config.mode).toBe('test');
  expect(stripeMocks.constructed).toHaveBeenCalledWith('oak_live_example', expect.objectContaining({ stripeContext: 'acct_sandbox' }));
  const config = stripeMocks.constructed.mock.calls.at(-1)?.[1] as { httpClient: { makeRequest: (...args: unknown[]) => unknown } };
  await config.httpClient.makeRequest('api.stripe.com', '443', '/v2/core/accounts/acct_sandbox', 'GET', { Accept: 'application/json' }, '', 'https', 1000);
  expect(stripeMocks.fetchMakeRequest).toHaveBeenCalledWith('api.stripe.com', '443', '/v2/core/accounts/acct_sandbox', 'GET', expect.objectContaining({ 'Stripe-Livemode': 'false' }), '', 'https', 1000);
});

it('does not scope a normal test secret key to a Stripe context', async () => {
  stripeRuntimeFromEnv({ STRIPE_PAYMENTS_ENABLED: 'true', STRIPE_SECRET_KEY: 'sk_test_fixture', STRIPE_CONTEXT: 'acct_sandbox', STRIPE_WEBHOOK_SECRET: 'whsec_platform', STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_connect', APP_URL: 'http://localhost:8080' });
  expect(stripeMocks.constructed).toHaveBeenCalledWith('sk_test_fixture', expect.not.objectContaining({ stripeContext: expect.any(String) }));
  const config = stripeMocks.constructed.mock.calls.at(-1)?.[1] as { httpClient: { makeRequest: (...args: unknown[]) => unknown } };
  await config.httpClient.makeRequest('api.stripe.com', '443', '/v1/account', 'GET', { Accept: 'application/json' }, '', 'https', 1000);
  expect(stripeMocks.fetchMakeRequest).toHaveBeenCalledWith('api.stripe.com', '443', '/v1/account', 'GET', { Accept: 'application/json' }, '', 'https', 1000);
});

it('defaults real beta approval to empty and parses only explicit organisation IDs',()=>{
 const env={STRIPE_PAYMENTS_ENABLED:'true',STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_WEBHOOK_SECRET:'whsec_platform',STRIPE_CONNECT_WEBHOOK_SECRET:'whsec_connect'};
 expect(stripeRuntimeFromEnv(env)?.config.approvedOrganisationIds).toEqual([]);
 expect(stripeRuntimeFromEnv({...env,STRIPE_APPROVED_ORGANISATION_IDS:'org_one, org_two,,'})?.config.approvedOrganisationIds).toEqual(['org_one','org_two']);
});
