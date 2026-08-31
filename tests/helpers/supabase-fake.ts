export type FakeWrite = {
  kind: 'update' | 'insert';
  table: string;
  filter: { col: string; val: unknown } | null;
  payload: unknown;
};

export type FakeState = {
  table: string;
  ops: string[];
  filters: Record<string, unknown>;
  payload?: unknown;
  limitN?: number;
};

const TABELAS: Record<string, keyof Records> = { contas: 'contas' };

export type Records = { contas: any[] };

/** Cliente Supabase falso suficiente para `mlFetch`/`saveTokens`/`getAccount`. */
export function makeFakeSupabase(rows: Records) {
  const writes: FakeWrite[] = [];
  const states: FakeState[] = [];

  function chain(table: string) {
    const st: FakeState = { table, ops: [], filters: {} };
    states.push(st);

    const api: any = {
      select() {
        st.ops.push('select');
        return api;
      },
      not() {
        st.ops.push('not');
        return api;
      },
      eq(col: string, val: unknown) {
        st.ops.push('eq');
        st.filters[col] = val;
        return api;
      },
      ilike() {
        st.ops.push('ilike');
        return api;
      },
      or() {
        st.ops.push('or');
        return api;
      },
      order() {
        st.ops.push('order');
        return api;
      },
      limit(n: number) {
        st.ops.push('limit');
        st.limitN = n;
        return api;
      },
      update(payload: Record<string, unknown>) {
        st.ops.push('update');
        st.payload = payload;
        return api;
      },
      insert(payload: unknown) {
        st.ops.push('insert');
        st.payload = payload;
        return api;
      },
      then(resolve: (v: unknown) => unknown) {
        if (st.ops.includes('update') || st.ops.includes('insert')) {
          // Aplica o update na linha correspondente, para leituras seguintes verem o token novo.
          const seller = st.filters.seller_id;
          if (st.ops.includes('update') && seller !== undefined) {
            const alvo = rows[table as keyof Records].find(
              (r) => String((r as { seller_id: string }).seller_id) === String(seller),
            );
            if (alvo) Object.assign(alvo, st.payload);
          }
          writes.push({
            kind: st.ops.includes('insert') ? 'insert' : 'update',
            table: st.table,
            filter: st.filters.seller_id !== undefined
              ? { col: 'seller_id', val: st.filters.seller_id }
              : null,
            payload: st.payload,
          });
          return Promise.resolve(resolve({ data: null, error: null }));
        }
        return Promise.resolve(resolve({ data: resolveData(table, st, rows), error: null }));
      },
    };
    return api;
  }

  return {
    client: {
      from(table: string) {
        return chain(table);
      },
    },
    writes,
    states,
  };
}

function resolveData(table: string, st: FakeState, rows: Records): unknown {
  if (st.filters.seller_id !== undefined) {
    return rows[table as keyof Records].filter(
      (r) => String(r.seller_id) === String(st.filters.seller_id),
    );
  }
  return rows[table as keyof Records];
}