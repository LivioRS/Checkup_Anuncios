import { NextResponse } from 'next/server';
import { mlFetch, MlError, comConta } from '@/lib/ml/client';
import { abrirAnuncio, donoDoAnuncio } from '@/lib/ml/dono';
import { nomeDaLoja } from '@/lib/loja';
import { limparParaDescricao, temOrigem, type Notas } from '@/lib/ia';
import { registrarEscrita } from '@/lib/auditoria';
import { gerarPropostaDescricao, textoAtual } from '@/lib/ml/descricao';
import { lerBlocosDaLoja } from '@/lib/lojaBlocos';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST { acao: 'analisar' | 'melhorar', notas? } — só pensa, não grava no ML.
 *
 * A geração (montar contexto + chamar o Claude) vive em `src/lib/ml/descricao.ts`
 * (`gerarPropostaDescricao`) desde o plano 025 (f2c2), para o worker de lote
 * reusar a MESMA lógica. Aqui é só o wrapper: resolve a conta dona, injeta
 * `lerBlocosDaLoja` e converte `{ status, corpo }` em `NextResponse`.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    acao?: string;
    notas?: Notas;
    fontes?: string;
    blocos?: { sobre?: string; garantia?: string };
    origem?: string;
  };

  try {
    const { item, conta: dona } = await abrirAnuncio(id);
    const loja = nomeDaLoja(dona?.seller_id ?? item.seller_id, dona?.apelido);
    const { status, corpo } = await gerarPropostaDescricao({
      itemId: id,
      item,
      donaSellerId: dona?.seller_id,
      loja,
      body,
      carregarBlocos: lerBlocosDaLoja,
    });
    return NextResponse.json(corpo, { status });
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

/** PUT { plain_text } — este sim grava a descrição no anúncio. */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    plain_text?: string;
    origem?: string;
  };
  const texto = limparParaDescricao(body.plain_text ?? '');

  if (!texto) return NextResponse.json({ erro: 'Descrição vazia.' }, { status: 400 });

  const { conta } = await donoDoAnuncio(id).catch(() => ({ conta: null }));
  if (!conta) {
    return NextResponse.json(
      { erro: 'Este anúncio não é de nenhuma conta cadastrada — o painel só lê.' },
      { status: 403 },
    );
  }

  if (!temOrigem(texto)) {
    return NextResponse.json(
      {
        erro: 'A descrição não informa a origem do produto. Preencha a origem para inserir na descrição e então publicar.',
        faltaOrigem: true,
      },
      { status: 428 },
    );
  }

  const { item } = await abrirAnuncio(id);

  return comConta(conta.seller_id, async () => {
    const antes = await textoAtual(id);

    try {
      await mlFetch(`/items/${id}/description?api_version=2`, {
        method: 'PUT',
        body: JSON.stringify({ plain_text: limparParaDescricao(texto) }),
      });

      await registrarEscrita({
        conta,
        itemId: id,
        payload: { descricao: texto.slice(0, 8000) },
        antes: { descricao: antes.slice(0, 8000) },
        status: 200,
      });

      return NextResponse.json({ ok: true, caracteres: texto.length });
    } catch (e) {
      const status = e instanceof MlError ? e.status : 500;
      const corpo = e instanceof MlError ? e.body : { message: String(e) };
      await registrarEscrita({
        conta,
        itemId: id,
        payload: { descricao: texto.slice(0, 8000) },
        antes: { descricao: '' },
        status,
      });
      return NextResponse.json({ erro: 'O ML recusou a descrição', body: corpo }, { status });
    }
  });
}
