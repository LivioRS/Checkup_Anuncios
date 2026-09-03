import { NextResponse } from 'next/server';
import { mlFetch, MlError, comConta } from '@/lib/ml/client';
import { registrarCriacaoAnuncio } from '@/lib/auditoria';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type CriarBody = {
  seller_id?: string;
  catalog_product_id?: string;
  valor?: number | string;
  quantidade?: number | string;
  condicao?: string;
  marca?: string;
  modelo?: string;
  codigo?: string;
};

const CONDICOES = new Set(['new', 'used']);

type ItemCriado = { id?: string; status?: string; permalink?: string };

/**
 * Cria um anúncio vinculado a um produto de catálogo — passo 2 do fluxo de
 * criação rápida (plano 019).
 *
 * Invariante permanente (AGENTS.md): criação de anúncio NUNCA publica ativo
 * sozinho. A documentação do ML não lista `status` entre os campos aceitos no
 * corpo do POST /items inicial (só no PUT de atualização) — por isso este
 * fluxo manda o campo mesmo assim (inofensivo se for ignorado) e, sempre que a
 * resposta não confirmar "paused", faz IMEDIATAMENTE um PUT para pausar, antes
 * de devolver qualquer link/êxito ao chamador. Nunca depois.
 *
 * Toda tentativa — sucesso ou falha, em qualquer etapa — é logada em
 * `anuncio_criacoes` (payload enviado, status HTTP, item_id se houver, corpo
 * da resposta do ML). Nunca cria "silencioso".
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as CriarBody;

  const sellerId = String(body.seller_id ?? '').trim();
  const catalogProductId = String(body.catalog_product_id ?? '').trim();
  const valor = Number(body.valor);
  const quantidade = Number(body.quantidade);
  const condicao = String(body.condicao ?? '').trim();

  if (!sellerId) return NextResponse.json({ erro: 'Falta seller_id.' }, { status: 400 });
  if (!catalogProductId) {
    return NextResponse.json({ erro: 'Falta catalog_product_id.' }, { status: 400 });
  }
  if (!Number.isFinite(valor) || valor <= 0) {
    return NextResponse.json({ erro: 'Valor inválido.' }, { status: 400 });
  }
  if (!Number.isInteger(quantidade) || quantidade < 1) {
    return NextResponse.json({ erro: 'Quantidade inválida.' }, { status: 400 });
  }
  if (!CONDICOES.has(condicao)) {
    return NextResponse.json({ erro: 'Condição deve ser "new" ou "used".' }, { status: 400 });
  }

  const payload = {
    catalog_listing: true,
    catalog_product_id: catalogProductId,
    price: valor,
    currency_id: 'BRL',
    available_quantity: quantidade,
    condition: condicao,
    // Precaução, não confirmação: ver nota acima sobre o ML não documentar
    // este campo no create. O PUT de pausa abaixo garante o invariante mesmo
    // que este campo seja ignorado pelo ML.
    status: 'paused',
  };

  const registrar = (args: { status: number; itemId?: string | null; response: unknown }) =>
    registrarCriacaoAnuncio({
      sellerId,
      marca: body.marca,
      modelo: body.modelo,
      codigo: body.codigo,
      catalogProductId,
      payload,
      ...args,
    });

  return comConta(sellerId, async () => {
    let criado: ItemCriado | null = null;
    try {
      criado = await mlFetch<ItemCriado>('/items', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    } catch (e) {
      const status = e instanceof MlError ? e.status : 500;
      const corpo = e instanceof MlError ? e.body : { message: String(e) };
      await registrar({ status, response: corpo });
      return NextResponse.json(
        { erro: 'O ML recusou a criação do anúncio.', body: corpo },
        { status },
      );
    }

    // Garante a pausa mesmo se o ML tiver ignorado `status` no POST.
    let pausado = criado?.status === 'paused';
    let erroPausa: unknown = null;
    if (!pausado && criado?.id) {
      try {
        const atualizado = await mlFetch<{ status?: string }>(`/items/${criado.id}`, {
          method: 'PUT',
          body: JSON.stringify({ status: 'paused' }),
        });
        pausado = atualizado?.status === 'paused';
      } catch (e) {
        erroPausa = e instanceof MlError ? e.body : { message: String(e) };
      }
    }

    await registrar({
      status: 200,
      itemId: criado?.id ?? null,
      response: { criado, pausado, erroPausa },
    });

    if (!pausado) {
      // Caso crítico: o anúncio existe e pode estar ATIVO no Mercado Livre.
      // Não escondemos isso — devolvemos erro mesmo com o item já criado.
      return NextResponse.json(
        {
          erro:
            'O anúncio foi criado mas a pausa falhou — ele pode estar ATIVO no Mercado Livre. Pause manualmente agora.',
          criado,
          erroPausa,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true, criado: { ...criado, status: 'paused' } });
  });
}
