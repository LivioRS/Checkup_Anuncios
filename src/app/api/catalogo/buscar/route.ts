import { NextResponse } from 'next/server';
import { comConta, MlError } from '@/lib/ml/client';
import { buscarProdutos, prontoParaVincular } from '@/lib/ml/catalogo';

export const dynamic = 'force-dynamic';

/**
 * Busca candidato de catálogo por marca+modelo(+código) — SOMENTE LEITURA.
 *
 * Passo 1 do fluxo de criação rápida (plano 019): não cria nem vincula nada,
 * só mostra o que o catálogo do ML tem para aquele produto. Se vier `codigo`,
 * tenta primeiro como GTIN (produto único, mais confiável); sempre tenta
 * também por texto (marca+modelo) como reforço/alternativa — a mesma ordem já
 * usada em `buscarProdutos`.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const sellerId = (url.searchParams.get('seller_id') ?? '').trim();
  const marca = (url.searchParams.get('marca') ?? '').trim();
  const modelo = (url.searchParams.get('modelo') ?? '').trim();
  const codigo = (url.searchParams.get('codigo') ?? '').trim();

  if (!sellerId) {
    return NextResponse.json({ erro: 'Falta seller_id.' }, { status: 400 });
  }
  if (!marca && !modelo) {
    return NextResponse.json({ erro: 'Informe ao menos marca ou modelo.' }, { status: 400 });
  }

  const q = [marca, modelo].filter(Boolean).join(' ').trim() || null;

  try {
    return await comConta(sellerId, async () => {
      const { resultados, via } = await buscarProdutos({
        site: 'MLB',
        gtin: codigo || null,
        q,
        limite: 10,
      });

      const candidatos = resultados.map((p) => ({
        id: p.id,
        nome: p.name,
        status: p.status,
        domainId: p.domain_id,
        imagem: p.pictures?.[0]?.url ?? null,
        atributos: (p.attributes ?? []).slice(0, 6),
        situacao: prontoParaVincular(p),
      }));

      return NextResponse.json({ candidatos, via });
    });
  } catch (e) {
    const status = e instanceof MlError ? e.status : 500;
    return NextResponse.json({ erro: e instanceof Error ? e.message : String(e) }, { status });
  }
}
