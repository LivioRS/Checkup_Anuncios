import { NextResponse } from 'next/server';
import { perguntarAoClaude, promptBuscaEan, lerBuscaEan } from '@/lib/ia';
import { buscarNaWeb } from '@/lib/web/busca';
import { gtinChecksumOk } from '@/lib/gtin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Busca o EAN/GTIN/UPC de um produto na web (plano 029 — complemento). NÃO fala com o ML.
 * Fluxo: busca web → 1 chamada de extração (proibida de inventar) → confere o dígito
 * verificador antes de devolver. Um código errado gruda o anúncio no produto errado do
 * catálogo — pior que não ter nenhum — por isso qualquer sinal de dúvida vira `ean:null`.
 * Precisa de `WEB_SEARCH_API_KEY` + chave de IA.
 */
type Corpo = { titulo?: string; marca?: string; modelo?: string };

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Corpo;
  const titulo = String(body.titulo ?? '').trim();
  const marca = String(body.marca ?? '').trim();
  const modelo = String(body.modelo ?? '').trim();

  if (titulo.length < 5 && !(marca && modelo)) {
    return NextResponse.json({ erro: 'Informe o título (ou marca + modelo).' }, { status: 400 });
  }

  const alvo = marca && modelo ? `${marca} ${modelo}` : titulo;
  const query = `${alvo} EAN GTIN UPC código de barras barcode`;

  try {
    const paginas = await buscarNaWeb(query, 3);
    if (paginas.length === 0) {
      return NextResponse.json({ ean: null, fontes: [], aviso: 'Nada encontrado na web.' });
    }

    const bruto = await perguntarAoClaude(
      promptBuscaEan(
        paginas.map((p) => ({ url: p.url, conteudo: p.conteudo })),
        { titulo, marca: marca || undefined, modelo: modelo || undefined },
      ),
      600,
    );
    const { ean, fonteTexto } = lerBuscaEan(bruto);
    const fontes = paginas.map((p) => p.url).filter(Boolean);

    if (!ean) {
      return NextResponse.json({
        ean: null,
        fontes,
        aviso: 'Não achei um código confiável na web — pode ser que esse produto não tenha EAN mesmo.',
      });
    }

    // A IA já foi instruída a não inventar, mas o checksum é a última trava: número com
    // dígito verificador errado não é um EAN de verdade, seja lá de onde a IA tirou.
    if (gtinChecksumOk(ean) === false) {
      return NextResponse.json({
        ean: null,
        fontes,
        aviso: `Achei "${ean}" na web, mas o dígito verificador não bate — deve estar errado na fonte. Ignorei.`,
      });
    }

    return NextResponse.json({ ean, fontes, fonteTexto });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const semConfig = /WEB_SEARCH_API_KEY|Nenhuma IA configurada|ANTHROPIC_API_KEY|OPENROUTER_API_KEY/i.test(msg);
    return NextResponse.json(
      {
        erro: semConfig
          ? 'Busca web ou IA não configurada (WEB_SEARCH_API_KEY + OPENROUTER_API_KEY/ANTHROPIC_API_KEY).'
          : msg,
      },
      { status: semConfig ? 503 : 502 },
    );
  }
}
