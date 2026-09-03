import { NextResponse } from 'next/server';
import { comConta, mlFetch } from '@/lib/ml/client';
import { buscarProdutos } from '@/lib/ml/catalogo';
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

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * "Preencher com IA" (plano 033, Parte B) — do TÍTULO (+ gtin/marca/modelo se já tiver), monta um
 * rascunho: categoria + marca + modelo + ficha + descrição. Cada peça da sua fonte, best-effort
 * (peça que falha volta vazia, nunca derruba o resto). Tudo volta como SUGESTÃO pro Livio
 * conferir. Não cria nada no ML, não publica.
 */
type Corpo = { seller_id?: string; titulo?: string; gtin?: string; marca?: string; modelo?: string };

async function resolverCategoria(q: string): Promise<{ category_id: string; category_nome: string } | null> {
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
      const e = lerEscolhaCategoria(bruto, cands.map((c) => c.category_id));
      if (e) escolhido = cands.find((c) => c.category_id === e.category_id) ?? escolhido;
    } catch {
      /* fica com o primeiro do preditor */
    }
  }
  return { category_id: escolhido.category_id, category_nome: escolhido.category_name };
}

async function fichaDoGtin(gtin: string): Promise<{ nome: string; valor: string }[]> {
  const { resultados } = await buscarProdutos({ site: 'MLB', gtin, limite: 3 });
  const p = resultados.find((r) => (r.attributes?.length ?? 0) > 0);
  return (p?.attributes ?? [])
    .filter((a) => a.value_name && a.value_id !== '-1')
    .map((a) => ({ nome: a.name ?? a.id ?? '', valor: a.value_name as string }));
}

async function fichaDaWeb(
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

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Corpo;
  const sellerId = String(body.seller_id ?? '').trim();
  const titulo = String(body.titulo ?? '').trim();
  const gtin = String(body.gtin ?? '').trim();
  let marca = String(body.marca ?? '').trim();
  let modelo = String(body.modelo ?? '').trim();

  if (titulo.length < 10) {
    return NextResponse.json({ erro: 'Título com pelo menos 10 caracteres.' }, { status: 400 });
  }

  const rodar = async () => {
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
      resolverCategoria(titulo).catch(() => null),
      (async () => {
        try {
          if (/^\d{8,14}$/.test(gtin)) return await fichaDoGtin(gtin);
          if (temBuscaWeb() && temIA()) return await fichaDaWeb(titulo, marca, modelo);
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
  };

  try {
    return sellerId ? await comConta(sellerId, rodar) : await rodar();
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
