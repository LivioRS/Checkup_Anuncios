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

/** Genérico: uma chave por tabela, cada uma com as linhas daquela tabela. */
export type Records = Record<string, any[]>;

/**
 * Cliente Supabase falso suficiente pros testes deste repo — qualquer tabela, não só `contas`
 * (usado por `token-flow`/`anuncios`/`oauth-portal`/`client-accounts`). `select`/`eq`/`update`/
 * `insert`/`limit`/`order` bastam: nenhum código de produção deste repo usa `.single()` etc.
 * (sempre `.limit(1)` + `data?.[0]`), então o fake também não precisa.
 */
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
      // `.maybeSingle()` — usado por `lerBlocosDaLoja` (loja_blocos, plano 025). Terminal:
      // resolve `{ data: <primeira linha que casa os filtros> | null, error: null }`, sem
      // depender do `.then` abaixo. O Supabase de verdade devolve a linha só (não array).
      maybeSingle() {
        st.ops.push('maybeSingle');
        rows[table] ??= [];
        const data = resolveData(table, st, rows);
        return Promise.resolve({ data: (data[0] as unknown) ?? null, error: null });
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
        rows[table] ??= [];
        const filtroCol = Object.keys(st.filters)[0];

        if (st.ops.includes('update') || st.ops.includes('insert')) {
          if (st.ops.includes('update') && filtroCol !== undefined) {
            const val = st.filters[filtroCol];
            const alvo = rows[table].find(
              (r) => String((r as Record<string, unknown>)[filtroCol]) === String(val),
            );
            if (alvo) Object.assign(alvo, st.payload);
          }
          if (st.ops.includes('insert')) {
            // `.insert(array)` (lote_itens do plano 024) grava uma linha por elemento; `.insert(obj)`
            // continua gravando uma linha só — mesmo comportamento do Supabase de verdade.
            const itens = Array.isArray(st.payload) ? st.payload : [st.payload];
            for (const item of itens) {
              rows[table].push({ id: rows[table].length + 1, ...(item as object) });
            }
          }
          writes.push({
            kind: st.ops.includes('insert') ? 'insert' : 'update',
            table: st.table,
            filter: filtroCol !== undefined ? { col: filtroCol, val: st.filters[filtroCol] } : null,
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

function resolveData(table: string, st: FakeState, rows: Records): unknown[] {
  let data = rows[table] ?? [];
  for (const [col, val] of Object.entries(st.filters)) {
    data = data.filter((r) => String((r as Record<string, unknown>)[col]) === String(val));
  }
  if (st.limitN !== undefined) data = data.slice(0, st.limitN);
  return data;
}
