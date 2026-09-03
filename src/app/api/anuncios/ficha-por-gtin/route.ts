import { NextResponse } from 'next/server';
import { comConta, MlError } from '@/lib/ml/client';
import { buscarProdutos } from '@/lib/ml/catalogo';

export const dynamic = 'force-dynamic';

/**
 * Enriquecimento DETERMINÍSTICO da ficha por GTIN (plano 032, Parte A) — SOMENTE LEITURA.
 *
 * `?gtin=<código>&seller_id=<opcional>`. Bate na API de catálogo do ML (`/products/search` por
 * `product_identifier`) e devolve os ATRIBUTOS estruturados do produto de catálogo, prontos pra
 * pré-preencher o form do anúncio avulso. Zero IA, zero scraping.
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
    const { resultados } = await buscarProdutos({ site: 'MLB', gtin, limite: 3 });
    const p =
      resultados.find((r) => r.id && (r.attributes?.length ?? 0) > 0) ??
      resultados.find((r) => r.id) ??
      null;
    if (!p) return { achado: false as const };

    return {
      achado: true as const,
      produto_id: p.id ?? null,
      titulo_sugerido: p.name ?? null,
      domain_id: p.domain_id ?? null,
      tem_fotos_catalogo: (p.pictures?.length ?? 0) > 0,
      atributos: (p.attributes ?? [])
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
    const status = e instanceof MlError ? e.status : 500;
    return NextResponse.json({ erro: e instanceof Error ? e.message : String(e) }, { status });
  }
}
