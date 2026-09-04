import { NextResponse } from 'next/server';
import { mlFetch, MlError, comConta } from '@/lib/ml/client';
import { garantirDono, registrarEscrita } from '@/lib/auditoria';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Encerra um anúncio (status: closed) — SEMPRE clique explícito do usuário.
 *
 * O Mercado Livre não tem "deletar" de verdade pra um item que já existiu: uma vez criado,
 * o caminho é `closed` (encerrado). Não reabre pelo fluxo normal e some das buscas — na
 * prática é o que "excluir" um anúncio de teste/errado significa aqui.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const { item, conta } = await garantirDono(id);

    return await comConta(conta.seller_id, async () => {
      const atualizado = await mlFetch<{ status?: string }>(`/items/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'closed' }),
      });
      await registrarEscrita({
        conta,
        itemId: id,
        payload: { status: 'closed' },
        antes: { status: item.status ?? null },
        status: 200,
      });
      return NextResponse.json({ ok: true, status: atualizado?.status ?? 'closed' });
    });
  } catch (e) {
    const status = e instanceof MlError ? e.status : 500;
    const corpo = e instanceof MlError ? e.body : { message: e instanceof Error ? e.message : String(e) };
    return NextResponse.json({ erro: 'O ML recusou o encerramento.', body: corpo }, { status });
  }
}
