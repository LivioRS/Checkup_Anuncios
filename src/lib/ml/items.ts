import { mlFetch, getAccount, listarContas, comConta } from './client';
import { db } from '../supabase';
import type { Item } from './model';

export type SearchResult = {
  paging: { limit: number; offset: number; total: number };
  results: string[];
};

export type Achado = {
  id: string;
  titulo: string | null;
  sku: string | null;
  local: boolean;
  sellerId?: string | null;
  /** Anúncio que disputa a página de catálogo: título, fotos e ficha são do ML. */
  catalogo?: boolean;
};

export { parseItemId } from './model';
export type { Alvo } from './model';

/**
 * Busca em duas etapas, de propósito:
 *  1. `repricer_status_ml` no Supabase (seller_id, item_id, titulo, sku) — 0 chamadas ao ML.
 *  2. Só se não achar nada localmente, cai na API do ML.
 */
function sanitizarTermo(termo: string): string {
  // Escapa caracteres que têm significado especial no ILIKE do PostgREST:
  // %  -> wildcard (zero ou mais caracteres)
  // _  -> wildcard (exatamente um caractere)
  // ,  -> separador de condições dentro do .or()
  return termo
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .replace(/,/g, '\\,');
}

export async function buscarAnuncios(q: string, limit = 10): Promise<Achado[]> {
  const conta = await getAccount();
  if (!conta) throw new Error('Nenhuma conta com token na tabela `contas`.');

  const termo = sanitizarTermo(q.trim());

  const { data, error } = await db()
    .from('repricer_status_ml')
    .select('item_id, titulo, sku')
    .eq('seller_id', conta.seller_id)
    .or(`titulo.ilike.%${termo}%,sku.ilike.%${termo}%,item_id.ilike.%${termo}%`)
    .limit(limit);

  if (!error && data?.length) {
    return data.map((r) => ({
      id: r.item_id as string,
      titulo: (r.titulo as string) ?? null,
      sku: (r.sku as string) ?? null,
      local: true,
    }));
  }

  const p = new URLSearchParams({ q: termo, limit: String(Math.min(limit, 20)) });
  const r = await mlFetch<SearchResult>(`/users/${conta.seller_id}/items/search?${p.toString()}`);
  return await resumoDosItens(r.results ?? []);
}

/**
 * Anúncios pendurados num User Product.
 *
 * O MLBU é o "produto do vendedor": o mesmo produto físico pode estar em vários
 * anúncios, com preço ou parcelamento diferentes. Não existe GET /items/MLBU… —
 * o caminho documentado é filtrar a busca do vendedor por user_product_id.
 */
/**
 * Anúncio de catálogo não entra na lista.
 *
 * Nele o título, as fotos e a ficha vêm da página de catálogo do ML — o
 * vendedor não edita nada disso. Mostrá-lo aqui só oferece uma porta que não
 * abre. Se o User Product SÓ tiver anúncios de catálogo, devolvemos assim
 * mesmo: melhor a lista marcada do que uma tela vazia sem explicação.
 */
function semCatalogo(achados: Achado[]): Achado[] {
  const proprios = achados.filter((a) => !a.catalogo);
  return proprios.length ? proprios : achados;
}

export async function itensDoUserProduct(upId: string): Promise<Achado[]> {
  // O User Product pertence a UMA conta, e nem sempre à padrão. Procuramos em
  // todas as cadastradas e paramos na primeira que responder.
  const contas = await listarContas();
  if (!contas.length) throw new Error('Nenhuma conta com token na tabela `contas`.');

  for (const c of contas) {
    try {
      const achados = await comConta(c.seller_id, async () => {
        const r = await mlFetch<SearchResult>(
          `/users/${c.seller_id}/items/search?user_product_id=${encodeURIComponent(upId)}`,
        );
        return resumoDosItens(r.results ?? []);
      });
      if (achados.length) return semCatalogo(achados);
    } catch {
      // Conta sem permissão para esse UP, ou token com problema: tenta a próxima.
    }
  }

  // A busca do vendedor é indexada e demora a enxergar anúncio recém-criado.
  // O detalhe do User Product responde na hora — dele extraímos os MLB citados.
  for (const c of contas) {
    try {
      const ids = await comConta(c.seller_id, async () => {
        const up = await mlFetch<unknown>(`/user-products/${encodeURIComponent(upId)}`);
        return idsDeItemNoJson(up);
      });
      if (!ids.length) continue;

      // O JSON do User Product cita outros códigos além dos seus anúncios
      // (produto de catálogo, concorrente no buy box). Ficamos só com os que
      // pertencem de fato a uma conta cadastrada — os outros o ML nem deixa
      // abrir, e abrir um deles seria pior que não achar nada.
      const nossos = new Set(contas.map((x) => String(x.seller_id)));
      const achados = (await comConta(c.seller_id, () => resumoDosItens(ids))).filter(
        (a) => a.sellerId && nossos.has(a.sellerId),
      );
      if (achados.length) return semCatalogo(achados);
    } catch {
      // Esse UP não é dessa conta: segue.
    }
  }

  return [];
}

/**
 * Varre a resposta do User Product atrás de códigos de anúncio.
 *
 * A documentação não fixa em qual campo eles vêm, e o formato pode mudar —
 * procurar pelo padrão MLB+dígitos (descartando os MLBU) é o jeito de não
 * depender de um nome de campo que não está garantido.
 */
function idsDeItemNoJson(obj: unknown): string[] {
  const achados = new Set<string>();
  const texto = JSON.stringify(obj ?? {});
  for (const m of texto.matchAll(/\b(ML[ABCMUV]|MCO|MPE|CBT)(\d{6,})\b/g)) {
    achados.add(`${m[1]}${m[2]}`);
  }
  return [...achados];
}

/** Multiget enxuto para completar títulos: 1 chamada, no máximo 20 IDs. */
export async function resumoDosItens(ids: string[]): Promise<Achado[]> {
  if (!ids.length) return [];
  const p = new URLSearchParams({
    ids: ids.slice(0, 20).join(','),
    attributes: 'id,title,status,seller_id,catalog_listing',
  });
  const res = await mlFetch<{ code: number; body: Item }[]>(`/items?${p.toString()}`);
  return res
    .filter((e) => e.code === 200)
    .map((e) => ({
      id: e.body.id,
      titulo: e.body.title,
      sku: null,
      local: false,
      sellerId: e.body.seller_id != null ? String(e.body.seller_id) : null,
      catalogo: e.body.catalog_listing === true,
    }));
}
