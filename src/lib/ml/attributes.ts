import { mlFetch, getAccount } from './client';
import type { CategoryAttribute, SpecsInput, Item } from './model';

export * from './model';

/* ------------------------------------------------------------------ *
 * Cache explícito TTL (24 h) por categoria + seller_id.
 * O Next ignora `revalidate` sob `force-dynamic`, então mantemos
 * cache em memória por processo. Expira em 24 h.
 * ------------------------------------------------------------------ */
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const TTL_MS = 24 * 60 * 60 * 1000;
const attrsCache = new Map<string, CacheEntry<CategoryAttribute[]>>();
const specsCache = new Map<string, CacheEntry<SpecsInput>>();

function cacheKey(categoryId: string, sellerId?: string): string {
  return `${sellerId ?? 'anon'}:${categoryId}`;
}

function getFromCache<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    cache.delete(key);
    return null;
  }
  return hit.data;
}

function setInCache<T>(cache: Map<string, CacheEntry<T>>, key: string, data: T) {
  cache.set(key, { data, expiresAt: Date.now() + TTL_MS });
}

/** Só para teste: os caches são um Map de módulo, então vazam entre `it()` do mesmo arquivo. */
export function _limparCachesParaTeste(): void {
  attrsCache.clear();
  specsCache.clear();
}

/* ------------------------------------------------------------------ *
 * Busca de dados
 * ------------------------------------------------------------------ */

export async function getCategoryAttributes(categoryId: string) {
  const conta = await getAccount();
  const key = cacheKey(categoryId, conta?.seller_id);
  const cached = getFromCache(attrsCache, key);
  if (cached) return cached;

  const data = await mlFetch<CategoryAttribute[]>(`/categories/${categoryId}/attributes`);
  setInCache(attrsCache, key, data);
  return data;
}

/**
 * Acha o `value_id` certo pra "não tenho GTIN" na categoria.
 *
 * `EMPTY_GTIN_REASON` é atributo de lista fechada — o ML espera `value_id`, texto livre em
 * `value_name` sozinho é recusado com "Attribute [EMPTY_GTIN_REASON] is not valid" (visto na
 * prática: plano 029, anúncio avulso). Se a categoria nem tiver esse atributo na lista, GTIN é
 * obrigatório sem exceção pra ela — devolve `null` e quem chama decide o que fazer.
 */
export async function motivoSemGtin(
  categoryId: string,
): Promise<{ value_id: string; value_name: string } | null> {
  const attrs = await getCategoryAttributes(categoryId);
  const atributo = attrs.find((a) => a.id === 'EMPTY_GTIN_REASON');
  const valores = atributo?.values ?? [];
  if (!valores.length) return null;

  // Conferido na API de verdade (GET /categories/MLB438516/attributes): o ML fala "não TEM
  // código cadastrado", não "não possui" — o regex antigo não batia com nenhuma das 4 opções
  // e caía no values[0] ERRADO ("peça artesanal"), que não é o motivo do vendedor.
  const alvo =
    valores.find((v) =>
      /n[aã]o (tem|possui)|sem c[oó]digo|does not apply|not apply|no code/i.test(v.name ?? ''),
    ) ?? valores[0];
  if (!alvo?.id) return null;
  return { value_id: alvo.id, value_name: alvo.name ?? '' };
}

export async function getTechnicalSpecsInput(categoryId: string): Promise<SpecsInput> {
  const conta = await getAccount();
  const key = cacheKey(categoryId, conta?.seller_id);
  const cached = getFromCache(specsCache, key);
  if (cached) return cached;

  try {
    const data = await mlFetch<SpecsInput>(`/categories/${categoryId}/technical_specs/input`);
    setInCache(specsCache, key, data);
    return data;
  } catch {
    return { groups: [] };
  }
}

/**
 * Lê o anúncio.
 *
 * `include_internal_attributes=true` é o que traz os atributos marcados N/A —
 * mas é privilégio do DONO: pedir isso num anúncio de terceiro devolve 403 e
 * derruba a página inteira. Por isso o padrão é a leitura pública, e os
 * internos só são pedidos quando já sabemos que o anúncio é de uma conta nossa.
 */
export function getItem(itemId: string, opts: { internos?: boolean } = {}) {
  const sufixo = opts.internos ? '?include_internal_attributes=true' : '';
  return mlFetch<Item>(`/items/${itemId}${sufixo}`);
}
