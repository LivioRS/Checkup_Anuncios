import { NextResponse } from 'next/server';
import { assistenteIa, type CorpoIa } from '@/lib/anuncios/assistente';
import { clienteLogadoId } from '@/lib/portal/contaAtiva';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Espelho de `POST /api/anuncios/ia` pro CLIENTE do portal (plano 034). NÃO fala com o ML — só
 * exige uma sessão de cliente válida e reusa o mesmo núcleo. Não precisa de conexão ML (é só
 * IA), por isso o gate é `clienteLogadoId`, não `resolverContaDoClienteLogado`.
 */
export async function POST(req: Request) {
  if (!(await clienteLogadoId())) {
    return NextResponse.json({ erro: 'Faça login no portal para continuar.' }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as CorpoIa;
  return assistenteIa(body);
}
