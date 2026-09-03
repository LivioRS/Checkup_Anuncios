import { NextResponse } from 'next/server';
import { perguntarAoClaude, promptFichaDaWeb, lerFichaDaWeb } from '@/lib/ia';
import { buscarNaWeb } from '@/lib/web/busca';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Ficha técnica buscada no site do fabricante (plano 033, Parte C). NÃO fala com o ML.
 * Fluxo: busca web → junta o texto de 2-3 páginas → 1 chamada de extração → só specs FACTUAIS,
 * cada uma SUGESTÃO pro Livio conferir. Descrição NÃO é copiada (a rota de descrição reescreve).
 * Foto do fabricante fica de fora. Precisa de `WEB_SEARCH_API_KEY` + chave de IA.
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
  const query = `${alvo} especificações ficha técnica`;

  try {
    const paginas = await buscarNaWeb(query, 3);
    if (paginas.length === 0) {
      return NextResponse.json({ atributos: [], fontes: [], aviso: 'Nada encontrado na web.' });
    }

    const bruto = await perguntarAoClaude(
      promptFichaDaWeb(
        paginas.map((p) => ({ url: p.url, conteudo: p.conteudo })),
        { titulo, marca: marca || undefined, modelo: modelo || undefined },
      ),
      2000,
    );
    const { modeloConfere, atributos } = lerFichaDaWeb(bruto);
    const fontes = paginas.map((p) => p.url).filter(Boolean);

    if (!modeloConfere) {
      return NextResponse.json({
        atributos: [],
        fontes,
        aviso: 'As páginas encontradas parecem ser de outro modelo — confira a fonte antes de usar.',
      });
    }
    return NextResponse.json({ atributos, fontes });
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
