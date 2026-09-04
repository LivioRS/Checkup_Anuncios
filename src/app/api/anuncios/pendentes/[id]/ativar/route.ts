import { NextResponse } from 'next/server';
import { mlFetch, MlError, comConta } from '@/lib/ml/client';
import { garantirDono, registrarEscrita } from '@/lib/auditoria';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Ativa um anúncio pausado — SEMPRE clique explícito do usuário na tela de
 * pendentes, nunca automático (mesmo invariante do plano 019/029: o app não
 * ativa nada sozinho, só o humano decide).
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const { item, conta } = await garantirDono(id);

    return await comConta(conta.seller_id, async () => {
      const atualizado = await mlFetch<{ status?: string }>(`/items/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'active' }),
      });
      await registrarEscrita({
        conta,
        itemId: id,
        payload: { status: 'active' },
        antes: { status: item.status ?? null },
        status: 200,
      });
      return NextResponse.json({ ok: true, status: atualizado?.status ?? 'active' });
    });
  } catch (e) {
    const status = e instanceof MlError ? e.status : 500;
    const corpo = e instanceof MlError ? e.body : { message: e instanceof Error ? e.message : String(e) };
    return NextResponse.json({ erro: 'O ML recusou a ativação.', body: corpo }, { status });
  }
}
