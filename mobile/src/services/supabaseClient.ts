const gone = { message: 'Hosted Supabase is removed. Use the Hono API.' };

function query() {
  const result = { data: null, error: gone, count: null, status: 410, statusText: 'Gone' };
  const chain: Record<string, unknown> = {};
  const next = () => chain;
  for (const method of [
    'select',
    'insert',
    'update',
    'upsert',
    'delete',
    'eq',
    'neq',
    'gt',
    'gte',
    'lt',
    'lte',
    'in',
    'is',
    'like',
    'ilike',
    'or',
    'order',
    'limit',
    'range',
    'match',
    'not',
    'filter',
  ]) {
    chain[method] = next;
  }
  chain.single = async () => result;
  chain.maybeSingle = async () => result;
  chain.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return chain;
}

// Compatibility-only stub for legacy code paths. The production client uses the
// typed Hono APIs; keeping this boundary dynamic avoids pretending a removed
// hosted database schema is still available.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy query chains are intentionally untyped at this isolated compatibility boundary
export const supabase: any = {
  from: () => query(),
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    getUser: async () => ({ data: { user: null }, error: gone }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } }, error: null }),
    signInWithPassword: async () => ({ data: { user: null, session: null }, error: gone }),
    signUp: async () => ({ data: { user: null, session: null }, error: gone }),
    signOut: async () => ({ error: null }),
    signInWithOAuth: async () => ({ data: { url: null, provider: 'google' }, error: gone }),
  },
  storage: {
    from: () => ({
      upload: async () => ({ data: null, error: gone }),
      getPublicUrl: () => ({ data: { publicUrl: '' } }),
      remove: async () => ({ data: null, error: gone }),
    }),
  },
};
