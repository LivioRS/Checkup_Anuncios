import { NextResponse } from 'next/server';
import {
  perguntarAoClaude,
  perguntarComImagem,
  limparParaDescricao,
  promptDescricaoNova,
  promptRoteiroFotos,
  lerRoteiroFotos,
  promptFichaDaFoto,
  lerFichaDaFoto,
} from '@/lib/ia';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Assistente de IA pro anúncio FORA do catálogo (planos 030/032). Não fala com o ML — só com o
 * modelo de linguagem. `acao`:
 * - `descricao` → escreve a descrição do produto novo (título/marca/modelo/categoria).
 * - `roteiro-fotos` → o que fotografar. A IA NÃO gera imagem: o ML exige foto real do produto.
 * - `ficha-da-foto` (plano 032) → lê a ficha técnica de uma foto de etiqueta/manual/caixa
 *   (`foto_url`). Sugestão pro Livio revisar — NÃO preenche os atributos do ML sozinho.
 */
type CorpoIa = {
  acao?: string;
  titulo?: string;
  marca?: string;
  modelo?: string;
  category_id?: string;
  category_nome?: string;
  tem_fotos?: boolean;
  foto_url?: string;
};

const ACOES = new Set(['descricao', 'roteiro-fotos', 'ficha-da-foto']);

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as CorpoIa;
  const acao = String(body.acao ?? '').trim();
  const titulo = String(body.titulo ?? '').trim();
  const fotoUrl = String(body.foto_url ?? '').trim();

  if (!ACOES.has(acao)) {
    return NextResponse.json(
      { erro: 'acao deve ser "descricao", "roteiro-fotos" ou "ficha-da-foto".' },
      { status: 400 },
    );
  }
  if (acao === 'ficha-da-foto') {
    if (!/^https?:\/\/\S+$/i.test(fotoUrl)) {
      return NextResponse.json(
        { erro: 'foto_url deve ser uma URL http/https de uma imagem.' },
        { status: 400 },
      );
    }
  } else if (titulo.length < 5) {
    return NextResponse.json({ erro: 'Informe o título do produto primeiro.' }, { status: 400 });
  }

  const contexto = {
    titulo,
    marca: String(body.marca ?? '').trim() || undefined,
    modelo: String(body.modelo ?? '').trim() || undefined,
    categoria: String(body.category_nome ?? '').trim() || undefined,
    temFotos: !!body.tem_fotos,
  };

  try {
    if (acao === 'descricao') {
      const bruto = await perguntarAoClaude(promptDescricaoNova(contexto), 4000);
      return NextResponse.json({ sugestao: limparParaDescricao(bruto) });
    }
    if (acao === 'roteiro-fotos') {
      const bruto = await perguntarAoClaude(promptRoteiroFotos(contexto), 1500);
      return NextResponse.json({ fotos: lerRoteiroFotos(bruto) });
    }
    // ficha-da-foto
    const bruto = await perguntarComImagem(promptFichaDaFoto(), fotoUrl, 1500);
    const { tituloSugerido, atributos } = lerFichaDaFoto(bruto);
    return NextResponse.json({ titulo_sugerido: tituloSugerido, atributos });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const semChave = /Nenhuma IA configurada|ANTHROPIC_API_KEY|OPENROUTER_API_KEY/i.test(msg);
    return NextResponse.json(
      { erro: semChave ? 'Nenhuma IA configurada (OPENROUTER_API_KEY ou ANTHROPIC_API_KEY).' : msg },
      { status: semChave ? 503 : 502 },
    );
  }
}
