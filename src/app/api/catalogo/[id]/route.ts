import { NextResponse } from 'next/server';
import { comConta, MlError } from '@/lib/ml/client';
import { abrirAnuncio } from '@/lib/ml/dono';
import {
  produtoDeCatalogo,
  buscarProdutos,
  compararFicha,
  prontoParaVincular,
  vinculosDoAnuncio,
} from '@/lib/ml/catalogo';
import { parseItemId } from '@/lib/ml/model';

export const dynamic = 'force-dynamic';

/**
 * Consulta de produto de catálogo — SOMENTE LEITURA.
 *
 * Esta rota não cria nem vincula nada. Ela existe para você olhar um produto
 * específico antes de decidir, inclusive um que você viu navegando no site e
 * colou aqui. Vincular é ação de outra natureza e vai ficar em rota própria.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const colado = (url.searchParams.get('produto') ?? '').trim();

  try {
    const { item, conta } = await abrirAnuncio(id);

    return await comConta(conta?.seller_id, async () => {
      // O código colado pode vir como link do /p/ — o parser já sabe extrair.
      const alvo = parseItemId(colado);
      const produtoId = alvo?.id ?? colado;

      if (produtoId) {
        const produto = await produtoDeCatalogo(produtoId);
        if (!produto) {
          return NextResponse.json(
            { erro: `Não achei o produto de catálogo ${produtoId}.` },
            { status: 404 },
          );
        }
        return NextResponse.json({
          produto,
          comparacao: compararFicha(item, produto),
          situacao: prontoParaVincular(produto),
        });
      }

      // Sem código colado: mostra o que já está vinculado e sugere candidatos.
      const vinculos = await vinculosDoAnuncio(item);

      const gtin =
        (item.attributes ?? []).find((a) => a.id === 'GTIN' && a.value_id !== '-1')?.value_name ??
        null;

      const { resultados, via } = await buscarProdutos({
        site: item.site_id ?? 'MLB',
        gtin,
        q: item.title,
        domainId: item.domain_id ?? null,
      });

      return NextResponse.json({ candidatos: resultados, via, gtin, vinculos });
    });
  } catch (e) {
    const status = e instanceof MlError ? e.status : 500;
    return NextResponse.json({ erro: e instanceof Error ? e.message : String(e) }, { status });
  }
}
