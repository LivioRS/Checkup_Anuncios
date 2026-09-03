import { NextResponse } from 'next/server';
import { comConta, mlFetch, MlError } from '@/lib/ml/client';
import type { ResultadoBusca } from '@/lib/ml/catalogo-tipos';

export const dynamic = 'force-dynamic';

/**
 * Enriquecimento DETERMINÍSTICO da ficha por GTIN (plano 032, Parte A) — SOMENTE LEITURA.
 *
 * `?gtin=<código>&seller_id=<opcional>`. Bate direto em `/products/search` do ML por
 * `product_identifier` e devolve os ATRIBUTOS estruturados do produto de catálogo. Chama
 * `mlFetch` diretamente (não `buscarProdutos`) de propósito: assim uma falha REAL do ML (token
 * inválido, 401, 5xx) volta como erro, em vez de virar `achado: false` — sem essa distinção o
 * "não encontrei" some entre "não tem no catálogo" e "a integração com o ML quebrou".
 *
 * **Não** devolve as imagens do produto de catálogo: são do fabricante/ML e não podem virar as
 * fotos do anúncio do vendedor (o ML exige foto real; risco de direito autoral). Ver veredito do
 * LLM Council em `plans/032-enriquecer-ficha-sem-agente.md`.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const gtin = (url.searchParams.get('gtin') ?? '').trim();
  const sellerId = (url.searchParams.get('seller_id') ?? '').trim();

  if (!/^\d{8,14}$/.test(gtin)) {
    return NextResponse.json({ erro: 'GTIN inválido — use 8 a 14 dígitos.' }, { status: 400 });
  }

  const buscar = async () => {
    const p = new URLSearchParams({ site_id: 'MLB', status: 'active', product_identifier: gtin });
    const r = await mlFetch<{ results?: ResultadoBusca[] }>(`/products/search?${p}`);
    const resultados = Array.isArray(r?.results) ? r.results : [];

    const prod =
      resultados.find((x) => x.id && (x.attributes?.length ?? 0) > 0) ??
      resultados.find((x) => x.id) ??
      null;
    if (!prod) return { achado: false as const };

    return {
      achado: true as const,
      produto_id: prod.id ?? null,
      titulo_sugerido: prod.name ?? null,
      domain_id: prod.domain_id ?? null,
      tem_fotos_catalogo: (prod.pictures?.length ?? 0) > 0,
      atributos: (prod.attributes ?? [])
        .filter((a) => a.id && a.value_name && a.value_id !== '-1')
        .map((a) => ({
          id: a.id as string,
          nome: a.name ?? (a.id as string),
          valor: a.value_name as string,
        })),
    };
  };

  try {
    const r = sellerId ? await comConta(sellerId, buscar) : await buscar();
    return NextResponse.json(r);
  } catch (e) {
    // 404 do ML aqui = "nenhum produto de catálogo com esse GTIN" — não é erro de integração.
    if (e instanceof MlError && e.status === 404) {
      return NextResponse.json({ achado: false });
    }
    const status = e instanceof MlError ? e.status : 500;
    return NextResponse.json(
      { erro: `O Mercado Livre recusou a busca por GTIN (HTTP ${status}). Confira ML_CLIENT_ID/token.` },
      { status },
    );
  }
}
