import { NextResponse } from 'next/server';
import { buscarCatalogo } from '@/lib/anuncios/consultas';
import { resolverContaDoClienteLogado, respostaErroConta } from '@/lib/portal/contaAtiva';

export const dynamic = 'force-dynamic';

/**
 * Espelho de `GET /api/catalogo/buscar` pro CLIENTE do portal (plano 034). A busca no catálogo
 * do ML roda com o token da conexão do cliente logado. `seller_id` da query só escolhe entre as
 * conexões do próprio cliente.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const pedido = (url.searchParams.get('seller_id') ?? '').trim() || undefined;
  const marca = (url.searchParams.get('marca') ?? '').trim();
  const modelo = (url.searchParams.get('modelo') ?? '').trim();
  const codigo = (url.searchParams.get('codigo') ?? '').trim();

  const r = await resolverContaDoClienteLogado(pedido);
  if ('erro' in r) {
    const { status, mensagem } = respostaErroConta(r.erro);
    return NextResponse.json({ erro: mensagem }, { status });
  }
  return r.executar(() => buscarCatalogo({ marca, modelo, codigo }));
}
