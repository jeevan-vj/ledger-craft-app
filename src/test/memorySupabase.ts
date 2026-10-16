type Row = Record<string, unknown>;

type Filter = { op: 'eq' | 'neq' | 'gte' | 'lt' | 'lte'; key: string; value: unknown };

export type MemorySupabase = ReturnType<typeof createMemorySupabase>;

function matches(row: Row, filters: Filter[]) {
  return filters.every((filter) => {
    const value = row[filter.key];
    if (filter.op === 'eq') return value === filter.value;
    if (filter.op === 'neq') return value !== filter.value;
    if (filter.op === 'gte') return String(value) >= String(filter.value);
    if (filter.op === 'lt') return String(value) < String(filter.value);
    if (filter.op === 'lte') return String(value) <= String(filter.value);
    return true;
  });
}

/**
 * In-memory stand-in for the removed hosted Supabase client.
 * Enough of the query builder for payment and invoice unit tests.
 */
export function createMemorySupabase(userId = 'test-user') {
  const tables: Record<string, Row[]> = {};
  let sequence = 1;

  const bucket = (table: string) => {
    if (!tables[table]) tables[table] = [];
    return tables[table];
  };

  function from(table: string) {
    const filters: Filter[] = [];
    let action: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let payload: Row | Row[] | null = null;
    let selectSpec = '*';

    const run = () => {
      const rows = bucket(table);
      if (action === 'insert') {
        const incoming = Array.isArray(payload) ? payload : [payload ?? {}];
        const stored = incoming.map((row) => {
          const next: Row = {
            id: row.id ?? `row-${sequence++}`,
            created_at: row.created_at ?? new Date().toISOString(),
            updated_at: row.updated_at ?? new Date().toISOString(),
            ...row,
          };
          rows.push(next);
          return next;
        });
        return { data: stored.length === 1 ? stored[0] : stored, error: null };
      }

      if (action === 'update') {
        const hits = rows.filter((row) => matches(row, filters));
        hits.forEach((row) => Object.assign(row, payload, { updated_at: new Date().toISOString() }));
        return { data: hits, error: null };
      }

      if (action === 'delete') {
        tables[table] = rows.filter((row) => !matches(row, filters));
        return { data: null, error: null };
      }

      let selected = rows.filter((row) => matches(row, filters)).map((row) => ({ ...row }));
      if (table === 'payments' && selectSpec.includes('invoices')) {
        selected = selected.map((payment) => {
          const invoice = bucket('invoices').find((row) => row.id === payment.invoice_id);
          const customer = invoice
            ? bucket('customers').find((row) => row.id === invoice.customer_id)
            : undefined;
          return {
            ...payment,
            invoices: invoice ? { ...invoice, customers: customer ?? null } : null,
          };
        });
      }
      if (table === 'invoices' && selectSpec.includes('customers')) {
        selected = selected.map((invoice) => ({
          ...invoice,
          customers: bucket('customers').find((row) => row.id === invoice.customer_id) ?? null,
          line_items: [],
        }));
      }
      return { data: selected, error: null };
    };

    const chain: Record<string, unknown> = {
      select(spec = '*') {
        selectSpec = spec;
        return chain;
      },
      insert(row: Row | Row[]) {
        action = 'insert';
        payload = row;
        return chain;
      },
      update(row: Row) {
        action = 'update';
        payload = row;
        return chain;
      },
      delete() {
        action = 'delete';
        return chain;
      },
      eq(key: string, value: unknown) {
        filters.push({ op: 'eq', key, value });
        return chain;
      },
      neq(key: string, value: unknown) {
        filters.push({ op: 'neq', key, value });
        return chain;
      },
      gte(key: string, value: unknown) {
        filters.push({ op: 'gte', key, value });
        return chain;
      },
      lt(key: string, value: unknown) {
        filters.push({ op: 'lt', key, value });
        return chain;
      },
      lte(key: string, value: unknown) {
        filters.push({ op: 'lte', key, value });
        return chain;
      },
      order() {
        return chain;
      },
      limit() {
        return chain;
      },
      async single() {
        const result = run();
        if (action === 'insert') {
          return { data: result.data, error: null };
        }
        const list = Array.isArray(result.data) ? result.data : result.data ? [result.data] : [];
        const row = list[0];
        if (!row) return { data: null, error: { message: 'not found', code: 'PGRST116' } };
        return { data: row, error: null };
      },
      then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
        return Promise.resolve(run()).then(resolve, reject);
      },
    };

    return chain;
  }

  return {
    tables,
    reset() {
      for (const key of Object.keys(tables)) tables[key] = [];
      sequence = 1;
    },
    supabase: {
      from,
      auth: {
        getUser: async () => ({ data: { user: { id: userId } }, error: null }),
        getSession: async () => ({ data: { session: null }, error: null }),
        signOut: async () => ({ error: null }),
      },
    },
  };
}
