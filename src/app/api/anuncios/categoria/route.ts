import { NextResponse } from 'next/server';
import { comConta, MlError, mlFetch } from '@/lib/ml/client';

export const dynamic = 'force-dynamic';

type DomainHit = {
  domain_id?: string;
  domain_name?: string;
  category_id?: string;
  category_name?: string;
};

/**
 * Sugere `category_id` a partir do título do produto (plano 029) — SOMENTE LEITURA. Usa o
 * `domain_discovery` do ML, o mesmo motor que a criação de anúncio na interface deles usa pra
 * adivinhar a categoria. O vendedor confere/troca antes de criar.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  const sellerId = (url.searchParams.get('seller_id') ?? '').trim();

  if (q.length < 3) {
    return NextResponse.json({ erro: 'Digite ao menos 3 caracteres do título.' }, { status: 400 });
  }

  const buscar = async () => {
    const hits = await mlFetch<DomainHit[]>(
      `/sites/MLB/domain_discovery/search?limit=5&q=${encodeURIComponent(q)}`,
    );
    return (Array.isArray(hits) ? hits : [])
      .filter((h) => h.category_id)
      .map((h) => ({
        category_id: h.category_id,
        category_name: h.category_name ?? null,
        domain_name: h.domain_name ?? null,
      }));
  };

  try {
    const sugestoes = sellerId ? await comConta(sellerId, buscar) : await buscar();
    return NextResponse.json({ sugestoes });
  } catch (e) {
    const status = e instanceof MlError ? e.status : 500;
    return NextResponse.json({ erro: e instanceof Error ? e.message : String(e) }, { status });
  }
}
