import { NextResponse } from 'next/server';
import { mlFetch, MlError, getAccount, comConta } from '@/lib/ml/client';
import { abrirAnuncio } from '@/lib/ml/dono';
import { getCategoryAttributes, getItem } from '@/lib/ml/attributes';
import { agruparPerguntas } from '@/lib/ml/perguntas';
import { tendenciasDaCategoria, perguntasDoAnuncio } from '@/lib/ml/analise';
import { nomeDaLoja } from '@/lib/loja';
import { origemDoItem } from '@/lib/ml/origem';
import type { Item } from '@/lib/ml/model';
import {
  perguntarAoClaude,
  limparParaDescricao,
  grudarBlocos,
  temOrigem,
  promptNotas,
  promptMelhoria,
  lerNotas,
  notaGeral,
  type AtributoResumo,
  type ContextoAnuncio,
  type Notas,
} from '@/lib/ia';
import { garantirDono, registrarEscrita } from '@/lib/auditoria';
import { db } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function textoAtual(itemId: string): Promise<string> {
  try {
    const d = await mlFetch<{ plain_text?: string }>(`/items/${itemId}/description`);
    return d.plain_text ?? '';
  } catch {
    return '';
  }
}

async function montarContexto(
  itemId: string,
  item: Item,
  loja?: string,
): Promise<ContextoAnuncio> {
  const descricao = await textoAtual(itemId);

  let atributos: AtributoResumo[] = [];
  try {
    const catAttrs = await getCategoryAttributes(item.category_id);
    const nomes = new Map(catAttrs.map((a) => [a.id, a.name]));
    atributos = (item.attributes ?? [])
      .filter((a) => a.value_name && a.value_id !== '-1')
      .map((a) => ({ nome: nomes.get(a.id) ?? a.name ?? a.id, valor: a.value_name }));
  } catch {
    /* segue sem ficha */
  }

  let opinioes: string[] = [];
  try {
    const r = await mlFetch<{ reviews?: { title?: string; content?: string }[] }>(
      `/reviews/item/${itemId}`,
    );
    opinioes = (r.reviews ?? [])
      .map((o) => [o.title, o.content].filter(Boolean).join(' — '))
      .filter((t) => t.length > 15)
      .slice(0, 8);
  } catch {
    /* item sem opiniões */
  }

  const perguntas = agruparPerguntas(await perguntasDoAnuncio(itemId)).slice(0, 15);

  let termosBuscados: string[] = [];
  try {
    const termos = await tendenciasDaCategoria(item.category_id, item.site_id ?? 'MLB');
    termosBuscados = termos.map((t) => t.keyword);
  } catch {
    /* categoria sem tendências publicadas */
  }

  return {
    titulo: item.title,
    categoria: item.category_id,
    atributos,
    descricao,
    opinioes,
    fotos: (item.pictures ?? []).length,
    perguntas,
    termosBuscados,
    loja: '',
  };
}

async function lerBlocos(sellerId?: string) {
  if (!sellerId) return {};
  const { data } = await db()
    .from('loja_blocos')
    .select('sobre, garantia')
    .eq('seller_id', sellerId)
    .maybeSingle();
  return { sobre: data?.sobre ?? undefined, garantia: data?.garantia ?? undefined };
}

/** POST { acao: 'analisar' | 'melhorar', notas? } — só pensa, não grava no ML. */
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
    const contexto = await comConta(dona?.seller_id, () => montarContexto(id, item, loja));
    contexto.fontes = body.fontes;

    const catAttrs = await comConta(dona?.seller_id, () =>
      getCategoryAttributes(item.category_id).catch(() => []),
    );
    const origem = origemDoItem(item, catAttrs);
    const contextoComOrigem = { ...contexto, origem: origem.valor ?? ((body.origem ?? '').trim() || undefined) };

    if (body.acao === 'analisar') {
      const bruto = await perguntarAoClaude(promptNotas(contextoComOrigem), 2000);
      const notas = lerNotas(bruto);
      if (!notas) {
        return NextResponse.json(
          { erro: 'Não consegui interpretar a resposta da análise.', bruto: bruto.slice(0, 500) },
          { status: 502 },
        );
      }
      return NextResponse.json({ notas, geral: notaGeral(notas), atual: contexto.descricao });
    }

    const conta = await getAccount().catch(() => null);

    const daTela = body.blocos ?? {};
    const salvos = await lerBlocos(conta?.seller_id);
    const blocos = {
      sobre: (daTela.sobre ?? '').trim() || salvos.sobre,
      garantia: (daTela.garantia ?? '').trim() || salvos.garantia,
    };
    const bruto = await perguntarAoClaude(
      promptMelhoria(contextoComOrigem, body.notas ?? null, blocos),
      4000,
    );

    return NextResponse.json({
      sugestao: grudarBlocos(limparParaDescricao(bruto), blocos),
      atual: contexto.descricao,
      usouBlocos: !!(blocos.sobre || blocos.garantia),
      blocos,
    });
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