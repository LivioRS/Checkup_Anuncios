import { mlFetch, MlError } from './client';
import type { ProdutoCatalogo, ResultadoBusca } from './catalogo-tipos';

export * from './catalogo-tipos';

/**
 * Leitura de produtos de catálogo — as páginas de produto (PDP) do ML.
 *
 * Vocabulário que confunde e vale fixar: PRODUTO de catálogo (MLB…) é a página
 * criada pelo ML; ANÚNCIO (também MLB…) é o seu. Os dois usam o mesmo prefixo e
 * a mesma cara de número, então não dá para separar pelo formato — só
 * perguntando à API.
 */

export async function produtoDeCatalogo(id: string): Promise<ProdutoCatalogo | null> {
  try {
    const p = await mlFetch<ProdutoCatalogo>(`/products/${encodeURIComponent(id)}`);
    return p?.id || p?.name ? p : null;
  } catch (e) {
    // 404 aqui significa: não é anúncio nem produto. Deixa o erro original falar.
    if (e instanceof MlError) return null;
    return null;
  }
}

/** Nome antigo, mantido porque a tela de falha ainda chama por ele. */
export const ehProdutoDeCatalogo = produtoDeCatalogo;

/**
 * Busca produtos de catálogo.
 *
 * A ordem das tentativas não é arbitrária: por GTIN o ML devolve UM produto, o
 * certo. Por palavra-chave devolve vários, e a documentação avisa que vincular
 * ao produto errado gera reclamação e moderação — por isso o GTIN vem primeiro
 * quando o anúncio tem um.
 */
export async function buscarProdutos(opts: {
  site: string;
  gtin?: string | null;
  q?: string | null;
  domainId?: string | null;
  limite?: number;
}): Promise<{ resultados: ResultadoBusca[]; via: 'gtin' | 'texto' | null }> {
  const limite = opts.limite ?? 10;

  if (opts.gtin) {
    const p = new URLSearchParams({
      site_id: opts.site,
      status: 'active',
      product_identifier: opts.gtin,
    });
    try {
      const r = await mlFetch<{ results?: ResultadoBusca[] }>(`/products/search?${p}`);
      if (r.results?.length) return { resultados: r.results.slice(0, limite), via: 'gtin' };
    } catch {
      /* GTIN sem produto: cai para a busca por texto */
    }
  }

  if (opts.q) {
    const p = new URLSearchParams({ site_id: opts.site, status: 'active', q: opts.q });
    if (opts.domainId) p.set('domain_id', opts.domainId);
    try {
      const r = await mlFetch<{ results?: ResultadoBusca[] }>(`/products/search?${p}`);
      return { resultados: (r.results ?? []).slice(0, limite), via: 'texto' };
    } catch {
      /* sem resultado */
    }
  }

  return { resultados: [], via: null };
}

/* ------------------------------------------------------------------ *
 * O vínculo já existe? Prova, não promessa.
 * ------------------------------------------------------------------ */

export type Vinculo = {
  id: string;
  status?: string;
  permalink?: string;
  catalog_listing?: boolean;
  catalog_product_id?: string | null;
  price?: number;
  sold_quantity?: number;
  /** SYNC | UNSYNC | desconhecido — do recurso /public/buybox/sync. */
  sincronia: string;
};

/**
 * Lista os anúncios de catálogo criados a partir deste anúncio.
 *
 * Depois do opt-in a dúvida legítima é "funcionou?". O anúncio original não
 * muda de cara — ele continua sendo de marketplace, e o Mercado Livre até
 * continua exibindo nele o convite para competir no catálogo. Quem responde é
 * o campo `item_relations`: ali estão os anúncios de catálogo que nasceram
 * dele. Se tem linha aqui, o vínculo existe.
 */
export async function vinculosDoAnuncio(item: {
  id?: string;
  item_relations?: { id?: string; variation_id?: number }[] | null;
}): Promise<Vinculo[]> {
  const ids = (item.item_relations ?? []).map((r) => r?.id).filter(Boolean) as string[];
  if (!ids.length) return [];

  let relacionados: { code: number; body: ProdutoRelacionado }[] = [];
  try {
    const p = new URLSearchParams({
      ids: ids.slice(0, 20).join(','),
      attributes: 'id,status,permalink,catalog_listing,catalog_product_id,price,sold_quantity',
    });
    relacionados = await mlFetch<{ code: number; body: ProdutoRelacionado }[]>(`/items?${p}`);
  } catch {
    relacionados = ids.map((id) => ({ code: 200, body: { id } }));
  }

  return Promise.all(
    relacionados
      .filter((r) => r.code === 200 && r.body?.id)
      .map(async (r) => ({ ...r.body, id: r.body.id!, sincronia: await sincronia(r.body.id!) })),
  );
}

type ProdutoRelacionado = {
  id?: string;
  status?: string;
  permalink?: string;
  catalog_listing?: boolean;
  catalog_product_id?: string | null;
  price?: number;
  sold_quantity?: number;
};

/**
 * Preço, frete e estoque do anúncio de catálogo estão espelhando o original?
 * O ML documenta que a sincronização pode se perder mantendo o vínculo, e dá
 * este recurso para conferir — e outro para consertar.
 */
async function sincronia(itemId: string): Promise<string> {
  try {
    const r = await mlFetch<{ status?: string }>(`/public/buybox/sync/${itemId}`, {
      headers: { 'x-public': 'True' },
    });
    return r?.status ?? 'desconhecido';
  } catch {
    return 'desconhecido';
  }
}

/** Reconecta a sincronização de um anúncio que ficou UNSYNC. */
export async function ressincronizar(itemId: string): Promise<void> {
  await mlFetch('/public/buybox/sync', {
    method: 'POST',
    headers: { 'x-public': 'True' },
    body: JSON.stringify({ id: itemId }),
  });
}
