import { NextResponse } from 'next/server';
import { mlFetch, MlError, comConta } from '@/lib/ml/client';
import { registrarCriacaoAnuncio } from '@/lib/auditoria';
import { limparParaDescricao } from '@/lib/ia';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Cria um anúncio de marketplace FORA do catálogo (plano 029) — produto sem PDP no ML
 * (lançamento, nicho). Diferente de `/api/anuncios` (catálogo), aqui o vendedor informa tudo:
 * título, categoria, marca, modelo, GTIN (ou motivo de não ter), garantia, fotos, tipo de
 * anúncio, descrição.
 *
 * Mesmo invariante permanente do plano 019 (AGENTS.md): NUNCA publica ativo sozinho — nasce
 * `paused`, e se o ML ignorar o campo no create, um PUT de pausa roda IMEDIATAMENTE antes de
 * devolver sucesso. Toda tentativa é logada em `anuncio_criacoes` (`catalog_product_id` fica
 * `null`).
 */

type Garantia = { tipo?: string; tempo?: string };
type CriarAvulsoBody = {
  seller_id?: string;
  titulo?: string;
  category_id?: string;
  valor?: number | string;
  quantidade?: number | string;
  condicao?: string;
  marca?: string;
  modelo?: string;
  gtin?: string;
  garantia?: Garantia;
  fotos?: unknown;
  listing_type_id?: string;
  descricao?: string;
  /** Atributos extras da ficha (plano 032) — ex.: vindos do enriquecimento por GTIN. */
  atributos_extra?: unknown;
  /** De onde veio a ficha (plano 032, "Medição"): manual | gtin | foto | gtin+foto. */
  origem_ficha?: string;
};

const CONDICOES = new Set(['new', 'used']);
const TIPOS_ANUNCIO = new Set(['gold_special', 'gold_pro']);
const CATEGORIA_RE = /^ML[A-Z]\d+$/;
const ATRIBUTOS_RESERVADOS = new Set(['BRAND', 'MODEL', 'GTIN', 'EMPTY_GTIN_REASON']);

/** Normaliza `atributos_extra` do corpo: só {id,value_name} não-vazios, sem os reservados, teto 40. */
function lerAtributosExtra(bruto: unknown): { id: string; value_name: string }[] {
  if (!Array.isArray(bruto)) return [];
  return bruto
    .map((a) => a as { id?: unknown; value_name?: unknown })
    .filter(
      (a) =>
        typeof a.id === 'string' &&
        a.id.trim() !== '' &&
        typeof a.value_name === 'string' &&
        a.value_name.trim() !== '',
    )
    .map((a) => ({ id: (a.id as string).trim(), value_name: (a.value_name as string).trim() }))
    .filter((a) => !ATRIBUTOS_RESERVADOS.has(a.id.toUpperCase()))
    .slice(0, 40);
}

type ItemCriado = { id?: string; status?: string; permalink?: string };

function ehUrlDeFoto(s: unknown): s is string {
  return typeof s === 'string' && /^https?:\/\/\S+$/i.test(s.trim());
}

/** Garantia -> `sale_terms` do ML. `nenhuma`/ausente => "Sem garantia". */
function saleTerms(g: Garantia | undefined): { id: string; value_name: string }[] {
  const tempo = (g?.tempo ?? '').trim() || '90 dias';
  if (g?.tipo === 'vendedor') {
    return [
      { id: 'WARRANTY_TYPE', value_name: 'Garantia do vendedor' },
      { id: 'WARRANTY_TIME', value_name: tempo },
    ];
  }
  if (g?.tipo === 'fabrica') {
    return [
      { id: 'WARRANTY_TYPE', value_name: 'Garantia de fábrica' },
      { id: 'WARRANTY_TIME', value_name: tempo },
    ];
  }
  return [{ id: 'WARRANTY_TYPE', value_name: 'Sem garantia' }];
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as CriarAvulsoBody;

  const sellerId = String(body.seller_id ?? '').trim();
  const titulo = String(body.titulo ?? '').trim();
  const categoryId = String(body.category_id ?? '').trim();
  const valor = Number(body.valor);
  const quantidade = Number(body.quantidade);
  const condicao = String(body.condicao ?? '').trim();
  const marca = String(body.marca ?? '').trim();
  const modelo = String(body.modelo ?? '').trim();
  const gtin = String(body.gtin ?? '').trim();
  const listingTypeId = String(body.listing_type_id ?? 'gold_special').trim();
  const fotos = Array.isArray(body.fotos) ? body.fotos.filter(ehUrlDeFoto).map((s) => s.trim()) : [];
  const descricao = limparParaDescricao(String(body.descricao ?? ''));
  const atributosExtra = lerAtributosExtra(body.atributos_extra);
  const origemFicha = String(body.origem_ficha ?? '').trim() || (atributosExtra.length ? 'gtin' : 'manual');

  if (!sellerId) return NextResponse.json({ erro: 'Falta seller_id.' }, { status: 400 });
  if (titulo.length < 10 || titulo.length > 60) {
    return NextResponse.json(
      { erro: 'Título deve ter entre 10 e 60 caracteres.' },
      { status: 400 },
    );
  }
  if (!CATEGORIA_RE.test(categoryId)) {
    return NextResponse.json(
      { erro: 'Categoria inválida — use o código no formato MLBxxxx (botão "sugerir").' },
      { status: 400 },
    );
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
  if (!marca || !modelo) {
    return NextResponse.json({ erro: 'Marca e modelo são obrigatórios.' }, { status: 400 });
  }
  if (fotos.length === 0) {
    return NextResponse.json(
      { erro: 'Informe pelo menos uma URL de foto (http/https).' },
      { status: 400 },
    );
  }
  if (!TIPOS_ANUNCIO.has(listingTypeId)) {
    return NextResponse.json(
      { erro: 'Tipo de anúncio deve ser "gold_special" ou "gold_pro".' },
      { status: 400 },
    );
  }

  const atributos: { id: string; value_name: string }[] = [
    { id: 'BRAND', value_name: marca },
    { id: 'MODEL', value_name: modelo },
    gtin
      ? { id: 'GTIN', value_name: gtin }
      : { id: 'EMPTY_GTIN_REASON', value_name: 'Não possui código universal de produto' },
  ];

  // Atributos extras (plano 032) entram DEPOIS dos do form, sem duplicar id.
  const idsUsados = new Set(atributos.map((a) => a.id.toUpperCase()));
  for (const ex of atributosExtra) {
    if (idsUsados.has(ex.id.toUpperCase())) continue;
    idsUsados.add(ex.id.toUpperCase());
    atributos.push(ex);
  }

  const payload = {
    title: titulo,
    // `family_name` é obrigatório no modelo novo de publicação do ML pra anúncio FORA do
    // catálogo (agrupa o anúncio/variações). Sem ele o ML recusa com
    // `body.required_fields ... [family_name]`; se for IGUAL ao `title` o ML recusa com
    // `body.invalid_fields`. Usamos marca + modelo (o "nome do produto"), teto de 60.
    family_name: `${marca} ${modelo}`.slice(0, 60),
    category_id: categoryId,
    price: valor,
    currency_id: 'BRL',
    available_quantity: quantidade,
    buying_mode: 'buy_it_now',
    listing_type_id: listingTypeId,
    condition: condicao,
    pictures: fotos.map((source) => ({ source })),
    sale_terms: saleTerms(body.garantia),
    attributes: atributos,
    // Mesma precaução do plano 019: o create do ML não documenta `status`, mas mandamos —
    // e o PUT de pausa abaixo garante o invariante se for ignorado.
    status: 'paused',
  };

  const registrar = (args: { status: number; itemId?: string | null; response: unknown }) =>
    registrarCriacaoAnuncio({
      sellerId,
      marca,
      modelo,
      codigo: gtin || null,
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

    // 1. Garante a pausa mesmo se o ML tiver ignorado `status` no POST.
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

    // 2. Descrição (best-effort — o anúncio já existe pausado; falha aqui não derruba o sucesso).
    let erroDescricao: unknown = null;
    if (descricao && criado?.id) {
      try {
        await mlFetch(`/items/${criado.id}/description?api_version=2`, {
          method: 'PUT',
          body: JSON.stringify({ plain_text: descricao }),
        });
      } catch (e) {
        erroDescricao = e instanceof MlError ? e.body : { message: String(e) };
      }
    }

    await registrar({
      status: 200,
      itemId: criado?.id ?? null,
      response: {
        criado,
        pausado,
        erroPausa,
        erroDescricao,
        origem_ficha: origemFicha,
        atributos_extra: atributosExtra.length,
      },
    });

    if (!pausado) {
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

    return NextResponse.json({
      ok: true,
      criado: { ...criado, status: 'paused' },
      erroDescricao,
    });
  });
}
