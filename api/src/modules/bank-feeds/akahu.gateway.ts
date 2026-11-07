import { z } from 'zod';
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,255}$/);
const amount = z.string().regex(/^-?\d+(?:\.\d+)?$/);
const accountSchema = z.object({ _id: id, name:z.string(), formatted_account:z.string().optional(), status:z.enum(['ACTIVE','INACTIVE']), connection:z.object({name:z.string()}).optional(), balance:z.object({currency:z.string(),current:amount}).optional() });
const transactionSchema = z.object({ _id:id, date:z.string().datetime({offset:true}), description:z.string(), amount });
export type AkahuAccount = z.infer<typeof accountSchema>;
export type AkahuTransaction = z.infer<typeof transactionSchema>;
export class AkahuRevokedError extends Error { constructor() { super('Akahu access was revoked. Reconnect after reviewing the connection.'); } }
/** Preserve monetary JSON number lexemes before decoding; never round through a JS number. */
function exactJson(raw:string):unknown {
  return JSON.parse(raw.replace(/"(?:\\.|[^"\\])*"|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g, (token, numeric:string|undefined) => numeric === undefined ? token : JSON.stringify(numeric)));
}
export interface BankFeedGateway {
  accounts():Promise<AkahuAccount[]>;
  transactions(accountId:string,from:string,to:string):Promise<AkahuTransaction[]>;
  revoke():Promise<void>;
}
function checked<T>(schema:z.ZodType<T>,value:unknown):T {const result=schema.safeParse(value);if(!result.success)throw new Error('Akahu returned an invalid response.');return result.data;}
export class AkahuGateway implements BankFeedGateway {
  constructor(private readonly appId:string, private readonly userToken:string, private readonly fetcher:typeof fetch = fetch) {}
  private async request(path:string, method='GET') {
    const request = new Request(`https://api.akahu.io/v1${path}`, {method,signal:AbortSignal.timeout(20_000),headers:{'X-Akahu-ID':this.appId,'X-Akahu-Token':this.userToken}});
    let response:Response;
    try { response = await this.fetcher(request); } catch { throw new Error('Akahu is unavailable. Try again later.'); }
    if(response.status===401) throw new AkahuRevokedError();
    if(!response.ok) throw new Error('Akahu request was not accepted. Try again later.');
    const raw=await response.text();
    if(raw.length>5_000_000) throw new Error('Akahu response exceeds the supported size.');
    if(!raw && method==='DELETE') return {};
    try { return exactJson(raw); } catch { throw new Error('Akahu returned an invalid response.'); }
  }
  async accounts() {
    return checked(z.object({success:z.literal(true),items:z.array(accountSchema).max(500)}),await this.request('/accounts')).items;
  }
  async transactions(accountId:string,from:string,to:string) {
    id.parse(accountId); const rows:AkahuTransaction[]=[]; const seen=new Set<string>(); let cursor:string|null=null;
    for(let page=0;page<100;page++) {
      const query:URLSearchParams=new URLSearchParams({start:from,end:to,...(cursor?{cursor}:{})});
      const response:{success:true;items:AkahuTransaction[];cursor?:{next?:string|null}}=checked(z.object({success:z.literal(true),items:z.array(transactionSchema),cursor:z.object({next:z.string().nullable().optional()}).optional()}),await this.request(`/accounts/${encodeURIComponent(accountId)}/transactions?${query}`));
      rows.push(...response.items); if(rows.length>100_000) throw new Error('Akahu pagination limit reached.');
      cursor=response.cursor?.next??null; if(!cursor) return rows;
      if(cursor.length>1024||seen.has(cursor)) throw new Error('Invalid Akahu pagination cursor.'); seen.add(cursor);
    }
    throw new Error('Akahu pagination limit reached.');
  }
  async revoke() { const result=await this.request('/token','DELETE');if(result&&typeof result==='object'&&Object.keys(result).length>0&&!z.object({success:z.literal(true)}).safeParse(result).success)throw new Error('Akahu revocation was not acknowledged.'); }
}
