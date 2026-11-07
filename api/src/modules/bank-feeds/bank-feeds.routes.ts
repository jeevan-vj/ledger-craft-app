import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { bankFeedDisconnectSchema } from '../../../../packages/contracts/src/bank-feeds';
import type { AppEnv } from '../../types';
import { requireSession } from '../auth/require-session';
import { disconnectFeedsForUser, feedSummaryForUser, syncFeedsForUser, type BankFeedConfig } from './bank-feeds.service';
/** Config remains a server-only closure, never a client-selected organisation. */
export function bankFeedRoutes(config?:BankFeedConfig) {
 const routes=new Hono<AppEnv>();
 for(const prefix of ['', '/api']) {
  routes.get(`${prefix}/bank-feeds/akahu`,async c=>{const {db,user}=await requireSession(c);return c.json(await feedSummaryForUser(db,user.id,config));});
  routes.post(`${prefix}/bank-feeds/akahu/sync`,async c=>{const {db,user}=await requireSession(c);const result=await syncFeedsForUser(db,user.id,config);await c.get('scheduleRecurringAlarm')?.(Date.now()+86_400_000);return c.json(result);});
  routes.post(`${prefix}/bank-feeds/akahu/disconnect`,async c=>{const {db,user}=await requireSession(c);bankFeedDisconnectSchema.parse(await c.req.json());return c.json(await disconnectFeedsForUser(db,user.id,config));});
  routes.get(`${prefix}/bank-feeds/akahu/connect`,()=>{throw new HTTPException(503,{message:'Full App connections are unavailable pending verified OAuth configuration, Akahu review and mobile app-lock acceptance.'});});
 }
 return routes;
}
