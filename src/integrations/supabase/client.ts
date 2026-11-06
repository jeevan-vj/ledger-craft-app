export type { Database } from './types';
import type { RemovedBackendRows } from './removedBackendTypes';

/** Compatibility tombstone. No method performs network or database work. */
export interface RemovedBackendError { message: string; code?: string }
const gone: RemovedBackendError = { message: 'Hosted Supabase is removed. Use the Hono API.' };
interface RemovedResult<T> { data: T | null; error: RemovedBackendError; count: null; status: 410; statusText: 'Gone' }
const removedResult = <T>(): RemovedResult<T> => ({ data: null, error: gone, count: null, status: 410, statusText: 'Gone' });

class RemovedQuery<Row> implements PromiseLike<RemovedResult<Row[]>> {
  select(..._args: unknown[]) { return this; }
  insert(..._args: unknown[]) { return this; }
  update(..._args: unknown[]) { return this; }
  upsert(..._args: unknown[]) { return this; }
  delete(..._args: unknown[]) { return this; }
  eq(..._args: unknown[]) { return this; }
  neq(..._args: unknown[]) { return this; }
  gt(..._args: unknown[]) { return this; }
  gte(..._args: unknown[]) { return this; }
  lt(..._args: unknown[]) { return this; }
  lte(..._args: unknown[]) { return this; }
  in(..._args: unknown[]) { return this; }
  is(..._args: unknown[]) { return this; }
  like(..._args: unknown[]) { return this; }
  ilike(..._args: unknown[]) { return this; }
  or(..._args: unknown[]) { return this; }
  order(..._args: unknown[]) { return this; }
  limit(..._args: unknown[]) { return this; }
  range(..._args: unknown[]) { return this; }
  match(..._args: unknown[]) { return this; }
  not(..._args: unknown[]) { return this; }
  filter(..._args: unknown[]) { return this; }
  contains(..._args: unknown[]) { return this; }
  containedBy(..._args: unknown[]) { return this; }
  overlaps(..._args: unknown[]) { return this; }
  textSearch(..._args: unknown[]) { return this; }
  single<T = Row>() { return Promise.resolve(removedResult<T>()); }
  maybeSingle<T = Row>() { return Promise.resolve(removedResult<T>()); }
  then<Resolved = RemovedResult<Row[]>, Rejected = never>(
    resolve?: (value: RemovedResult<Row[]>) => Resolved | PromiseLike<Resolved>,
    reject?: (reason: unknown) => Rejected | PromiseLike<Rejected>,
  ): Promise<Resolved | Rejected> { return Promise.resolve(removedResult<Row[]>()).then(resolve, reject); }
}
function from<Name extends keyof RemovedBackendRows>(_table: Name): RemovedQuery<RemovedBackendRows[Name]> { return new RemovedQuery(); }
type RemovedUser = import('@/types/auth-user').AuthUser;
export const supabase = {
  from,
  rpc: async (..._args: unknown[]) => removedResult<RemovedBackendRows['shared_invoices'][]>(),
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    getUser: async (): Promise<{ data: { user: RemovedUser | null }; error: RemovedBackendError }> => ({ data: { user: null }, error: gone }),
    onAuthStateChange: (..._args: unknown[]) => ({ data: { subscription: { unsubscribe() {} } }, error: null }),
    signInWithPassword: async (..._args: unknown[]) => ({ data: { user: null, session: null }, error: gone }),
    signUp: async (..._args: unknown[]) => ({ data: { user: null, session: null }, error: gone }),
    signOut: async () => ({ error: null }),
    signInWithOAuth: async (..._args: unknown[]) => ({ data: { url: null, provider: 'google' }, error: gone }),
  },
  storage: {
    from: (..._args: unknown[]) => ({
      upload: async (..._args: unknown[]) => ({ data: null, error: gone }),
      getPublicUrl: (..._args: unknown[]) => ({ data: { publicUrl: '' } }),
      remove: async (..._args: unknown[]) => ({ data: null, error: gone }),
      list: async (..._args: unknown[]) => removedResult<Array<{ name: string; id: string; created_at: string; updated_at?: string; metadata?: { size?: number; mimetype?: string } }>>(),
    }),
  },
  functions: { invoke: async (..._args: unknown[]) => ({ data: null, error: gone }) },
};
