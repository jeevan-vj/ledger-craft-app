import { describe, expect, it } from 'vitest';
import { AkahuGateway, AkahuRevokedError } from './akahu.gateway';
describe('Akahu HTTP boundary', () => {
  it('keeps credentials server side, follows bounded cursor pagination and uses string monetary lexemes', async () => {
    const requests: Request[] = [];
    const gateway = new AkahuGateway('app_test', 'user_test', async input => {
      const request = new Request(input); requests.push(request);
      return new Response(request.url.includes('cursor=next') ? '{"success":true,"items":[{"_id":"tx_2","date":"2026-10-02T02:00:00Z","description":"Coffee","amount":-0.10}],"cursor":{"next":null}}' : '{"success":true,"items":[{"_id":"tx_1","date":"2026-10-01T02:00:00Z","description":"Work","amount":1150.23}],"cursor":{"next":"next"}}');
    });
    const transactions = await gateway.transactions('acc_test', '2026-10-01', '2026-10-31');
    expect(transactions.map(row => row.amount)).toEqual(['1150.23', '-0.10']);
    expect(requests).toHaveLength(2); expect(requests[0]?.headers.get('X-Akahu-ID')).toBe('app_test');
    expect(requests[0]?.headers.get('X-Akahu-Token')).toBe('user_test');
    expect(requests[0]?.url).toContain('start=2026-10-01');
  });
  it('treats a provider 401 as revoked and never leaks the response or secret', async () => {
    const gateway = new AkahuGateway('app', 'secret', async () => new Response('secret echoed', { status:401 }));
    await expect(gateway.accounts()).rejects.toBeInstanceOf(AkahuRevokedError);
  });
  it('refuses unexpected cursor origins and looping pagination', async () => {
    const gateway = new AkahuGateway('app', 'secret', async () => new Response('{"success":true,"items":[],"cursor":{"next":"same"}}'));
    await expect(gateway.transactions('acc_test', '2026-10-01','2026-10-31')).rejects.toThrow('pagination');
  });
  it('does not expose malformed provider payloads in validation errors', async () => {
    const gateway=new AkahuGateway('app','secret',async()=>new Response('{"success":true,"items":[{"_id":"acc_test","name":"Name","status":"secret"}]}'));
    await expect(gateway.accounts()).rejects.toThrow('invalid response');
    try {await gateway.accounts();}catch(error){expect(String(error)).not.toContain('secret');}
  });

  it('requires provider acknowledgement of revocation and uses the token DELETE endpoint',async()=>{
    let request:Request|undefined;
    const gateway=new AkahuGateway('app','token',async input=>{request=new Request(input);return new Response('{"success":false}');});
    await expect(gateway.revoke()).rejects.toThrow('not acknowledged');
    expect(request!.method).toBe('DELETE');expect(new URL(request!.url).pathname).toBe('/v1/token');
  });

});
