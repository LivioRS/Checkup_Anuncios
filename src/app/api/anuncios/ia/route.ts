import { NextResponse } from 'next/server';
import {
  perguntarAoClaude,
  limparParaDescricao,
  promptDescricaoNova,
  promptRoteiroFotos,
  lerRoteiroFotos,
} from '@/lib/ia';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Assistente de IA pro anúncio FORA do catálogo (plano 030). Não fala com o ML — só com o
 * Claude. `acao`:
 * - `descricao` → escreve a descrição do produto novo (título/marca/modelo/categoria).
 * - `roteiro-fotos` → o que fotografar. A IA NÃO gera imagem: o ML exige foto real do produto.
 */
type CorpoIa = {
  acao?: string;
  titulo?: string;
  marca?: string;
  modelo?: string;
  category_id?: string;
  category_nome?: string;
  tem_fotos?: boolean;
};

const ACOES = new Set(['descricao', 'roteiro-fotos']);

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as CorpoIa;
  const acao = String(body.acao ?? '').trim();
  const titulo = String(body.titulo ?? '').trim();

  if (!ACOES.has(acao)) {
    return NextResponse.json({ erro: 'acao deve ser "descricao" ou "roteiro-fotos".' }, { status: 400 });
  }
  if (titulo.length < 5) {
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
    const bruto = await perguntarAoClaude(promptRoteiroFotos(contexto), 1500);
    return NextResponse.json({ fotos: lerRoteiroFotos(bruto) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const semChave = /ANTHROPIC_API_KEY/i.test(msg);
    return NextResponse.json(
      { erro: semChave ? 'Claude não configurado (ANTHROPIC_API_KEY).' : msg },
      { status: semChave ? 503 : 502 },
    );
  }
}
