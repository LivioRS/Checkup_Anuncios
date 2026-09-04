import 'server-only';
import { NextResponse } from 'next/server';
import { mlFetch, MlError } from '@/lib/ml/client';
import { buscarProdutos, prontoParaVincular } from '@/lib/ml/catalogo';
import type { ResultadoBusca } from '@/lib/ml/catalogo-tipos';
import { buscarNaWeb, temBuscaWeb } from '@/lib/web/busca';
import {
  temIA,
  perguntarAoClaude,
  limparParaDescricao,
  promptEscolhaCategoria,
  lerEscolhaCategoria,
  promptMarcaModelo,
  lerMarcaModelo,
  promptDescricaoNova,
  promptFichaDaWeb,
  lerFichaDaWeb,
} from '@/lib/ia';

/**
 * Núcleos SOMENTE-LEITURA do fluxo de criação de anúncio (planos 019/029/030/032/033), extraídos
 * dos handlers `/api/anuncios/{categoria,ficha-por-gtin,rascunho}` e `/api/catalogo/buscar`
 * (plano 034). Cada função assume que JÁ está dentro do escopo de conta certo — o handler admin
 * embrulha em `comConta(sellerId, …)` (ou roda sem escopo, caindo no `ML_SELLER_ID_PADRAO`), o
 * handler do portal embrulha em `comContaCliente(clienteId, sellerId, …)`. Aqui a lógica de ML +
 * IA é uma só, sem duplicação.
 */

type DomainHit = {
  domain_id?: string;
  domain_name?: string;
  category_id?: string;
  category_name?: string;
};

/** `GET /api/anuncios/categoria` — sugere `category_id` pelo título (+ escolha da IA, best-effort). */
export async function sugerirCategoria(q: string): Promise<NextResponse> {
  if (q.length < 3) {
    return NextResponse.json({ erro: 'Digite ao menos 3 caracteres do título.' }, { status: 400 });
  }
  try {
    const hits = await mlFetch<DomainHit[]>(
      `/sites/MLB/domain_discovery/search?limit=5&q=${encodeURIComponent(q)}`,
    );
    const sugestoes = (Array.isArray(hits) ? hits : [])
      .filter((h) => h.category_id)
      .map((h) => ({
        category_id: h.category_id,
        category_name: h.category_name ?? null,
        domain_name: h.domain_name ?? null,
      }));

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

/** `GET /api/anuncios/ficha-por-gtin` — atributos estruturados do produto de catálogo por GTIN. */
export async function fichaPorGtin(gtin: string): Promise<NextResponse> {
  if (!/^\d{8,14}$/.test(gtin)) {
    return NextResponse.json({ erro: 'GTIN inválido — use 8 a 14 dígitos.' }, { status: 400 });
  }

  try {
    const p = new URLSearchParams({ site_id: 'MLB', status: 'active', product_identifier: gtin });
    const r = await mlFetch<{ results?: ResultadoBusca[] }>(`/products/search?${p}`);
    const resultados = Array.isArray(r?.results) ? r.results : [];

    const prod =
      resultados.find((x) => x.id && (x.attributes?.length ?? 0) > 0) ??
      resultados.find((x) => x.id) ??
      null;
    if (!prod) return NextResponse.json({ achado: false });

    return NextResponse.json({
      achado: true,
      produto_id: prod.id ?? null,
      titulo_sugerido: prod.name ?? null,
      domain_id: prod.domain_id ?? null,
      tem_fotos_catalogo: (prod.pictures?.length ?? 0) > 0,
      atributos: (prod.attributes ?? [])
        .filter((a) => a.id && a.value_name && a.value_id !== '-1')
        .map((a) => ({
          id: a.id as string,
          nome: a.name ?? (a.id as string),
          valor: a.value_name as string,
        })),
    });
  } catch (e) {
    // 404 do ML aqui = "nenhum produto de catálogo com esse GTIN" — não é erro de integração.
    if (e instanceof MlError && e.status === 404) {
      return NextResponse.json({ achado: false });
    }
    const status = e instanceof MlError ? e.status : 500;
    return NextResponse.json(
      { erro: `O Mercado Livre recusou a busca por GTIN (HTTP ${status}). Confira o token da conta.` },
      { status },
    );
  }
}

/** `GET /api/catalogo/buscar` — candidato de catálogo por marca+modelo(+código). */
export async function buscarCatalogo(input: {
  marca: string;
  modelo: string;
  codigo: string;
}): Promise<NextResponse> {
  const { marca, modelo, codigo } = input;
  if (!marca && !modelo) {
    return NextResponse.json({ erro: 'Informe ao menos marca ou modelo.' }, { status: 400 });
  }

  const q = [marca, modelo].filter(Boolean).join(' ').trim() || null;

  try {
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
  } catch (e) {
    const status = e instanceof MlError ? e.status : 500;
    return NextResponse.json({ erro: e instanceof Error ? e.message : String(e) }, { status });
  }
}

async function resolverCategoriaRascunho(
  q: string,
): Promise<{ category_id: string; category_nome: string } | null> {
  const hits = await mlFetch<
    { domain_name?: string; category_id?: string; category_name?: string }[]
  >(`/sites/MLB/domain_discovery/search?limit=5&q=${encodeURIComponent(q)}`).catch(() => []);
  const cands = (Array.isArray(hits) ? hits : [])
    .filter((h) => h.category_id)
    .map((h) => ({
      category_id: h.category_id as string,
      category_name: h.category_name ?? h.domain_name ?? '',
    }));
  if (cands.length === 0) return null;

  let escolhido = cands[0];
  if (temIA() && cands.length > 1) {
    try {
      const bruto = await perguntarAoClaude(promptEscolhaCategoria(q, cands), 500);
      const e = lerEscolhaCategoria(
        bruto,
        cands.map((c) => c.category_id),
      );
      if (e) escolhido = cands.find((c) => c.category_id === e.category_id) ?? escolhido;
    } catch {
      /* fica com o primeiro do preditor */
    }
  }
  return { category_id: escolhido.category_id, category_nome: escolhido.category_name };
}

async function fichaDoGtinRascunho(gtin: string): Promise<{ nome: string; valor: string }[]> {
  const { resultados } = await buscarProdutos({ site: 'MLB', gtin, limite: 3 });
  const p = resultados.find((r) => (r.attributes?.length ?? 0) > 0);
  return (p?.attributes ?? [])
    .filter((a) => a.value_name && a.value_id !== '-1')
    .map((a) => ({ nome: a.name ?? a.id ?? '', valor: a.value_name as string }));
}

async function fichaDaWebRascunho(
  titulo: string,
  marca: string,
  modelo: string,
): Promise<{ nome: string; valor: string }[]> {
  const alvo = marca && modelo ? `${marca} ${modelo}` : titulo;
  const paginas = await buscarNaWeb(`${alvo} especificações ficha técnica`, 3);
  if (paginas.length === 0) return [];
  const bruto = await perguntarAoClaude(
    promptFichaDaWeb(
      paginas.map((x) => ({ url: x.url, conteudo: x.conteudo })),
      { titulo, marca: marca || undefined, modelo: modelo || undefined },
    ),
    2000,
  );
  const { modeloConfere, atributos } = lerFichaDaWeb(bruto);
  return modeloConfere ? atributos : [];
}

/** `POST /api/anuncios/rascunho` — do título monta categoria + marca + modelo + ficha + descrição. */
export async function montarRascunho(input: {
  titulo: string;
  gtin: string;
  marca: string;
  modelo: string;
}): Promise<NextResponse> {
  const titulo = input.titulo;
  const gtin = input.gtin;
  let marca = input.marca;
  let modelo = input.modelo;

  if (titulo.length < 10) {
    return NextResponse.json({ erro: 'Título com pelo menos 10 caracteres.' }, { status: 400 });
  }

  try {
    // marca/modelo primeiro (barato, e o resto usa) — só se faltar.
    if ((!marca || !modelo) && temIA()) {
      try {
        const mm = lerMarcaModelo(await perguntarAoClaude(promptMarcaModelo(titulo), 300));
        marca = marca || mm.marca;
        modelo = modelo || mm.modelo;
      } catch {
        /* segue sem */
      }
    }

    const [categoria, ficha, descricao] = await Promise.all([
      resolverCategoriaRascunho(titulo).catch(() => null),
      (async () => {
        try {
          if (/^\d{8,14}$/.test(gtin)) return await fichaDoGtinRascunho(gtin);
          if (temBuscaWeb() && temIA()) return await fichaDaWebRascunho(titulo, marca, modelo);
          return [];
        } catch {
          return [];
        }
      })(),
      (async () => {
        if (!temIA()) return '';
        try {
          const bruto = await perguntarAoClaude(
            promptDescricaoNova({
              titulo,
              marca: marca || undefined,
              modelo: modelo || undefined,
              categoria: undefined,
              temFotos: false,
            }),
            4000,
          );
          return limparParaDescricao(bruto);
        } catch {
          return '';
        }
      })(),
    ]);

    return NextResponse.json({
      category_id: categoria?.category_id ?? '',
      category_nome: categoria?.category_nome ?? '',
      marca,
      modelo,
      atributos: ficha,
      descricao,
    });
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
