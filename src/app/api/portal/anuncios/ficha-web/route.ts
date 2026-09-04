import { NextResponse } from 'next/server';
import { fichaDaWeb, type CorpoFichaWeb } from '@/lib/anuncios/assistente';
import { clienteLogadoId } from '@/lib/portal/contaAtiva';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Espelho de `POST /api/anuncios/ficha-web` pro CLIENTE do portal (plano 034). NÃO fala com o ML
 * — só exige sessão de cliente e reusa o mesmo núcleo (busca web + extração por IA).
 */
export async function POST(req: Request) {
  if (!(await clienteLogadoId())) {
    return NextResponse.json({ erro: 'Faça login no portal para continuar.' }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as CorpoFichaWeb;
  return fichaDaWeb(body);
}
