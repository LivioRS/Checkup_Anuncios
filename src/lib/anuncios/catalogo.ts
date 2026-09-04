import 'server-only';
import { NextResponse } from 'next/server';
import { mlFetch, MlError } from '@/lib/ml/client';
import { registrarCriacaoAnuncio } from '@/lib/auditoria';

/**
 * Núcleo da criação de anúncio VINCULADO a produto de catálogo (plano 019), extraído do handler
 * `POST /api/anuncios` (plano 034) pra a rota espelho do portal reusar. A única diferença entre
 * admin e portal é o escopo (`comConta` x `comContaCliente`); payload, invariante de nascer
 * `paused` + PUT de pausa e o log em `anuncio_criacoes` são idênticos.
 */

export type CriarCatalogoBody = {
  seller_id?: string;
  catalog_product_id?: string;
  valor?: number | string;
  quantidade?: number | string;
  condicao?: string;
  marca?: string;
  modelo?: string;
  codigo?: string;
};

export type AbrirEscopoCatalogo = (
  body: CriarCatalogoBody,
) => Promise<
  | { sellerId: string; clienteId?: number; executar: <T>(fn: () => Promise<T>) => Promise<T> }
  | NextResponse
>;

const CONDICOES = new Set(['new', 'used']);

type ItemCriado = { id?: string; status?: string; permalink?: string };

export async function criarAnuncioCatalogo(
  body: CriarCatalogoBody,
  abrirEscopo: AbrirEscopoCatalogo,
): Promise<NextResponse> {
  const escopo = await abrirEscopo(body);
  if (escopo instanceof NextResponse) return escopo;
  const { sellerId, clienteId, executar } = escopo;

  const catalogProductId = String(body.catalog_product_id ?? '').trim();
  const valor = Number(body.valor);
  const quantidade = Number(body.quantidade);
  const condicao = String(body.condicao ?? '').trim();

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
    // Precaução, não confirmação: o ML não documenta `status` no create. O PUT de pausa abaixo
    // garante o invariante mesmo que este campo seja ignorado.
    status: 'paused',
  };

  const registrar = (args: { status: number; itemId?: string | null; response: unknown }) =>
    registrarCriacaoAnuncio({
      sellerId,
      clienteId,
      marca: body.marca,
      modelo: body.modelo,
      codigo: body.codigo,
      catalogProductId,
      payload,
      ...args,
    });

  return executar(async () => {
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
