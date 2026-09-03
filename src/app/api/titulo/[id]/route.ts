import { NextResponse } from 'next/server';
import { mlFetch, MlError, comConta } from '@/lib/ml/client';
import { abrirAnuncio, donoDoAnuncio } from '@/lib/ml/dono';
import { registrarEscrita } from '@/lib/auditoria';
import { gerarPropostaTitulo } from '@/lib/ml/titulo';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const VERSAO = 'titulo-2026-08-25-c';

/**
 * POST — só pensa: devolve 3 títulos e uma sugestão de MODEL. Não grava nada.
 *
 * A geração vive em `src/lib/ml/titulo.ts` (`gerarPropostaTitulo`) desde o plano
 * 025 (f2c2), para o worker de lote reusar a MESMA lógica. Aqui é só o wrapper:
 * resolve a conta dona e converte `{ status, corpo }` em `NextResponse`.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  try {
    const { item, conta } = await abrirAnuncio(id);

    return await comConta(conta?.seller_id, async () => {
      const { status, corpo } = await gerarPropostaTitulo(item, { temConta: !!conta });
      return NextResponse.json(corpo, { status });
    });
  } catch (e) {
    const status = e instanceof MlError ? e.status : 500;
    return NextResponse.json({ erro: e instanceof Error ? e.message : String(e) }, { status });
  }
}

function ehErroDeCampoDoTitulo(e: unknown): boolean {
  if (!(e instanceof MlError)) return false;
  const texto = JSON.stringify(e.body ?? '').toLowerCase();
  return texto.includes('family_name') || texto.includes('body_invalid_fields');
}

type Travado = {
  motivo: string;
  vendas: number;
  irmaos: { id: string; vendas: number; status?: string }[];
};

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { titulo?: string; modelo?: string };
  const titulo = (body.titulo ?? '').trim();
  const modelo = (body.modelo ?? '').trim();

  if (!titulo && !modelo) {
    return NextResponse.json({ erro: 'Nada para gravar.' }, { status: 400 });
  }
  if (titulo.length > 60) {
    return NextResponse.json(
      { erro: `O título tem ${titulo.length} caracteres; o limite do ML é 60.` },
      { status: 400 },
    );
  }

  const { item, conta } = await donoDoAnuncio(id).catch(() => ({ item: null, conta: null }));
  if (!conta) {
    return NextResponse.json(
      { erro: 'Este anúncio não é de nenhuma conta cadastrada — o painel só lê.' },
      { status: 403 },
    );
  }
  if (item?.catalog_listing) {
    return NextResponse.json(
      { erro: 'Anúncio de catálogo: o título é do catálogo do ML, não seu.' },
      { status: 409 },
    );
  }

  const resultado: {
    versao: string;
    modelo?: { ok: boolean; erro?: unknown };
    titulo?: { ok: boolean; campo?: string; erro?: unknown; travado?: Travado | null };
  } = { versao: VERSAO };

  return comConta(conta.seller_id, async () => {
    // 1. Modelo primeiro
    if (modelo) {
      try {
        await mlFetch(`/items/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ attributes: [{ id: 'MODEL', value_id: null, value_name: modelo }] }),
        });
        resultado.modelo = { ok: true };
        await registrarEscrita({
          conta,
          itemId: id,
          payload: { attributes: 'MODEL' },
          antes: { modelo: null },
          status: 200,
        });
      } catch (e) {
        const corpo = e instanceof MlError ? e.body : { message: String(e) };
        resultado.modelo = { ok: false, erro: corpo };
        await registrarEscrita({
          conta,
          itemId: id,
          payload: { modelo },
          antes: { modelo: null },
          status: 500,
        });
      }
    }

    // 2. Título
    if (titulo) {
      const porFamilia = !!item?.family_name;
      const primeiro = item?.family_name ? 'family_name' : 'title';
      const segundo = item?.family_name ? 'title' : 'family_name';

      try {
        await mlFetch(`/items/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ [primeiro]: titulo }),
        });
        resultado.titulo = { ok: true, campo: primeiro };
        await registrarEscrita({
          conta,
          itemId: id,
          payload: { [primeiro]: titulo },
          antes: { [primeiro]: item?.[primeiro] ?? null },
          status: 200,
        });
      } catch (e1) {
        if (!ehErroDeCampoDoTitulo(e1)) {
          const corpo = e1 instanceof MlError ? e1.body : { message: String(e1) };
          resultado.titulo = { ok: false, campo: 'primeiro', erro: e1 instanceof MlError ? e1.body : { message: String(e1) } };
          await registrarEscrita({
            conta,
            itemId: id,
            payload: { [primeiro]: titulo },
            antes: { [primeiro]: item?.[primeiro] ?? null },
            status: 500,
          });
        } else {
          try {
            await mlFetch(`/items/${id}`, {
              method: 'PUT',
              body: JSON.stringify({ [segundo]: titulo }),
            });
            resultado.titulo = { ok: true, campo: segundo };
            await registrarEscrita({
              conta,
              itemId: id,
              payload: { [segundo]: titulo },
              antes: { [segundo]: item?.[segundo] ?? null },
              status: 200,
            });
          } catch (e2) {
            const corpo = e2 instanceof MlError ? e2.body : { message: String(e2) };
            resultado.titulo = {
              ok: false,
              campo: segundo,
              erro: corpo,
              travado: await porQueTravou(conta.seller_id, id, item),
            };
            await registrarEscrita({
              conta,
              itemId: id,
              payload: { [segundo]: titulo },
              antes: { [segundo]: item?.[segundo] ?? null },
              status: 500,
            });
          }
        }
      }
    }

    const tudoOk =
      (!modelo || resultado.modelo?.ok) && (!titulo || resultado.titulo?.ok);

    return NextResponse.json(resultado, { status: tudoOk ? 200 : 207 });
  });
}

async function porQueTravou(
  sellerId: string,
  itemId: string,
  item: { user_product_id?: string | null; sold_quantity?: number } | null,
): Promise<Travado | null> {
  const up = item?.user_product_id;
  if (!up) {
    const vendas = item?.sold_quantity ?? 0;
    return vendas > 0
      ? { motivo: 'vendas neste anúncio', vendas, irmaos: [] }
      : null;
  }

  try {
    const busca = await mlFetch<{ results?: string[] }>(
      `/users/${sellerId}/items/search?user_product_id=${encodeURIComponent(up)}`,
    );
    const ids = (busca.results ?? []).slice(0, 20);
    if (!ids.length) return null;

    const p = new URLSearchParams({ ids: ids.join(','), attributes: 'id,sold_quantity,status' });
    const res = await mlFetch<{ code: number; body: { id?: string; sold_quantity?: number; status?: string } }[]>(
      `/items?${p}`,
    );

    const irmaos = res
      .filter((r) => r.code === 200 && r.body?.id)
      .map((r) => ({
        id: r.body.id!,
        vendas: r.body.sold_quantity ?? 0,
        status: r.body.status,
      }));

    const vendas = irmaos.reduce((soma, i) => soma + i.vendas, 0);
    if (!vendas) return null;

    return {
      motivo: 'vendas na família de anúncios',
      vendas,
      irmaos: irmaos.filter((i) => i.vendas > 0),
    };
  } catch {
    return null;
  }
}