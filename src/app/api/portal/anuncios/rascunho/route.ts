import { NextResponse } from 'next/server';
import { montarRascunho } from '@/lib/anuncios/consultas';
import { resolverContaDoClienteLogado, respostaErroConta } from '@/lib/portal/contaAtiva';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Espelho de `POST /api/anuncios/rascunho` ("Preencher com IA", plano 033) pro CLIENTE do portal
 * (plano 034). As partes que batem no ML (categoria, ficha por GTIN) rodam com o token da
 * conexão do cliente logado; as de IA/web não dependem de conta.
 */
type Corpo = { seller_id?: string; titulo?: string; gtin?: string; marca?: string; modelo?: string };

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Corpo;
  const pedido = String(body.seller_id ?? '').trim() || undefined;
  const input = {
    titulo: String(body.titulo ?? '').trim(),
    gtin: String(body.gtin ?? '').trim(),
    marca: String(body.marca ?? '').trim(),
    modelo: String(body.modelo ?? '').trim(),
  };

  const r = await resolverContaDoClienteLogado(pedido);
  if ('erro' in r) {
    const { status, mensagem } = respostaErroConta(r.erro);
    return NextResponse.json({ erro: mensagem }, { status });
  }
  return r.executar(() => montarRascunho(input));
}
