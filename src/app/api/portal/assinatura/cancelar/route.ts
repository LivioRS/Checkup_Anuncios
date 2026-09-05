import { NextResponse } from 'next/server';
import { supabaseServidor } from '@/lib/supabase/server';
import { cancelarAssinaturaMp, temCobranca } from '@/lib/mercadopago/client';
import { assinaturaDoCliente, atualizarStatusAssinatura } from '@/lib/portal/assinatura';

export const dynamic = 'force-dynamic';

/**
 * "Cancelar assinatura" no `/portal/painel` (plano 037, acabamento do f3c6). Cancela no Mercado
 * Pago (`PUT /preapproval/{id}` status=cancelled) e reflete na hora localmente — o webhook
 * também chegaria, mas o cliente não deve ficar esperando pra ver o efeito.
 */
export async function POST() {
  if (!temCobranca()) {
    return NextResponse.json({ erro: 'Cobrança não configurada.' }, { status: 503 });
  }

  const supabase = await supabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ erro: 'Faça login no portal para continuar.' }, { status: 401 });
  }

  const { data: rows } = await supabase.from('clientes').select('id').limit(1);
  const clienteId = (rows?.[0] as { id: number } | undefined)?.id;
  if (!clienteId) {
    return NextResponse.json({ erro: 'Sua conta ainda não tem um cadastro de cliente.' }, { status: 409 });
  }

  // `assinaturaDoCliente`/`atualizarStatusAssinatura` usam `db()` (service_role) — `assinaturas`
  // é service_role-only, como as outras tabelas de estado do portal. O `cliente_id` vem da
  // sessão e é conferido abaixo, então só cancela a própria.
  const assinatura = await assinaturaDoCliente(clienteId);
  if (!assinatura?.mpPreapprovalId || !['authorized', 'paused', 'pendente'].includes(assinatura.status)) {
    return NextResponse.json({ erro: 'Não há assinatura ativa para cancelar.' }, { status: 409 });
  }
  if (assinatura.clienteId !== clienteId) {
    return NextResponse.json({ erro: 'Essa assinatura não é sua.' }, { status: 409 });
  }

  try {
    await cancelarAssinaturaMp(assinatura.mpPreapprovalId);
  } catch (e) {
    return NextResponse.json(
      { erro: e instanceof Error ? e.message : 'Falha ao cancelar no Mercado Pago.' },
      { status: 502 },
    );
  }

  await atualizarStatusAssinatura(assinatura.mpPreapprovalId, 'cancelled');
  return NextResponse.json({ ok: true });
}
