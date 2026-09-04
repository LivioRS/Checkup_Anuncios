import { NextResponse } from 'next/server';
import { comConta, listarContas } from '@/lib/ml/client';
import { listarPendentes } from '@/lib/ml/items';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Um lugar só pra ver TODOS os anúncios pausados de todas as contas cadastradas —
 * criados pelo "Criar anúncio" ou pausados por qualquer outro motivo. O app nunca
 * ativa nada sozinho (AGENTS.md); esta tela só lista, o "Ativar" é clique do usuário.
 */
export async function GET() {
  const contas = await listarContas();

  const porConta = await Promise.all(
    contas.map(async (c) => {
      try {
        const itens = await comConta(c.seller_id, () => listarPendentes(c.seller_id));
        return { seller_id: c.seller_id, apelido: c.apelido, itens, erro: null as string | null };
      } catch (e) {
        return {
          seller_id: c.seller_id,
          apelido: c.apelido,
          itens: [] as Awaited<ReturnType<typeof listarPendentes>>,
          erro: e instanceof Error ? e.message : String(e),
        };
      }
    }),
  );

  return NextResponse.json({ contas: porConta });
}
