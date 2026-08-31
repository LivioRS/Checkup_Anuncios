import { NextResponse } from 'next/server';
import { mlFetch, MlError, comConta } from '@/lib/ml/client';
import { donoDoAnuncio } from '@/lib/ml/dono';
import { getItem } from '@/lib/ml/attributes';
import { produtoDeCatalogo, prontoParaVincular, compararFicha } from '@/lib/ml/catalogo';
import { registrarEscrita } from '@/lib/auditoria';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Opt-in: cria um anúncio de catálogo a partir do seu anúncio.
 *
 * Esta é a rota que MUDA alguma coisa, e o que ela faz não se desfaz com um
 * botão: nasce um anúncio novo, ligado ao seu, e as condições de venda passam a
 * sincronizar entre os dois sem opção de desligar — está escrito assim na
 * documentação do ML. Por isso ela confere tudo de novo no servidor, mesmo que
 * a tela já tenha conferido: quem grava é quem responde.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    catalog_product_id?: string;
    variation_id?: number | string;
    /** Confirmação explícita de quem viu as divergências e mesmo assim quer. */
    aceitoDivergencias?: boolean;
  };

  const produtoId = (body.catalog_product_id ?? '').trim();
  if (!produtoId) {
    return NextResponse.json({ erro: 'Falta o catalog_product_id.' }, { status: 400 });
  }

  const { item, conta } = await donoDoAnuncio(id).catch(() => ({ item: null, conta: null }));
  if (!conta) {
    return NextResponse.json(
      { erro: 'Este anúncio não é de nenhuma conta cadastrada — o painel só lê.' },
      { status: 403 },
    );
  }

  return comConta(conta.seller_id, async () => {
    const item = await getItem(id, { internos: true });

    if (item.catalog_listing) {
      return NextResponse.json(
        { erro: 'Este anúncio já é de catálogo.' },
        { status: 409 },
      );
    }

    const produto = await produtoDeCatalogo(produtoId);
    if (!produto) {
      return NextResponse.json({ erro: `Produto ${produtoId} não encontrado.` }, { status: 404 });
    }

    const situacao = prontoParaVincular(produto);
    if (!situacao.ok) {
      return NextResponse.json({ erro: situacao.motivo, situacao }, { status: 409 });
    }

    const comparacao = compararFicha(item, produto);
    const divergem = comparacao.filter((l) => l.situacao === 'diferente');
    if (divergem.length && !body.aceitoDivergencias) {
      return NextResponse.json(
        {
          erro: `${divergem.length} atributo(s) divergem entre o seu anúncio e o produto de catálogo.`,
          divergencias: divergem,
          precisaConfirmar: true,
        },
        { status: 409 },
      );
    }

    const payload: Record<string, unknown> = { item_id: id, catalog_product_id: produtoId };
    if (body.variation_id) payload.variation_id = Number(body.variation_id);

    try {
      const criado = await mlFetch<{ id?: string; permalink?: string; status?: string }>(
        '/items/catalog_listings',
        { method: 'POST', body: JSON.stringify(payload) },
      );

      await registrarEscrita({
        conta,
        itemId: id,
        payload: { catalog_listings: payload },
        antes: { catalog_product_id: produtoId },
        status: 200,
      });

      return NextResponse.json({
        ok: true,
        criado: { id: criado?.id, permalink: criado?.permalink, status: criado?.status },
      });
    } catch (e) {
      const status = e instanceof MlError ? e.status : 500;
      const corpo = e instanceof MlError ? e.body : { message: String(e) };
      await registrarEscrita({
        conta,
        itemId: id,
        payload: { catalog_listings: payload },
        antes: { catalog_product_id: produtoId },
        status,
      });
      return NextResponse.json({ erro: 'O ML recusou o vínculo', body: corpo }, { status });
    }
  });
}