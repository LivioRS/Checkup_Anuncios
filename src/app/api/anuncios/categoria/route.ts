import { NextResponse } from 'next/server';
import { comConta, MlError, mlFetch } from '@/lib/ml/client';
import { temIA, perguntarAoClaude, promptEscolhaCategoria, lerEscolhaCategoria } from '@/lib/ia';

export const dynamic = 'force-dynamic';

type DomainHit = {
  domain_id?: string;
  domain_name?: string;
  category_id?: string;
  category_name?: string;
};

/**
 * Sugere `category_id` a partir do título do produto (plano 029) — SOMENTE LEITURA. O
 * `domain_discovery` do ML (mesmo motor da interface deles) dá a lista de candidatos VÁLIDOS; se
 * houver `ANTHROPIC_API_KEY`, o Claude escolhe o melhor da lista e explica (plano 030). A escolha
 * da IA é best-effort — se ela falhar, `sugestoes` continua respondendo normalmente.
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

    let escolha: { category_id: string; motivo: string } | null = null;
    if (temIA() && sugestoes.length > 1) {
      try {
        const bruto = await perguntarAoClaude(
          promptEscolhaCategoria(
            q,
            sugestoes.map((s) => ({
              category_id: s.category_id!,
              category_name: s.category_name ?? s.domain_name ?? '',
            })),
          ),
          500,
        );
        escolha = lerEscolhaCategoria(
          bruto,
          sugestoes.map((s) => s.category_id!),
        );
      } catch {
        /* escolha da IA é best-effort — segue sem destaque */
      }
    }

    return NextResponse.json({ sugestoes, escolha });
  } catch (e) {
    const status = e instanceof MlError ? e.status : 500;
    return NextResponse.json({ erro: e instanceof Error ? e.message : String(e) }, { status });
  }
}
