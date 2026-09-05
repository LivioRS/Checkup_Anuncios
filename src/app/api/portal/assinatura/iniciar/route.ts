import { NextResponse } from 'next/server';
import { supabaseServidor } from '@/lib/supabase/server';
import { criarAssinatura, temCobranca } from '@/lib/mercadopago/client';
import { registrarInicioAssinatura } from '@/lib/portal/assinatura';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * "Assinar agora" no `/portal/painel` (plano 036, f3c6). Cria o `preapproval` no Mercado Pago em
 * checkout hospedado e devolve `init_point` — o browser redireciona pra lá; o cliente escolhe/
 * cadastra o cartão na página do MP, nunca aqui.
 */
export async function POST(req: Request) {
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

  const { data: rows } = await supabase.from('clientes').select('id, email').limit(1);
  const cliente = rows?.[0] as { id: number; email: string } | undefined;
  if (!cliente) {
    return NextResponse.json({ erro: 'Sua conta ainda não tem um cadastro de cliente.' }, { status: 409 });
  }

  try {
    const valorCentavos = env.mercadoPagoPlanoValorCentavos;
    const backUrl = new URL('/portal/painel?aviso=assinatura', req.url).toString();
    const { id, init_point } = await criarAssinatura({
      clienteId: cliente.id,
      email: cliente.email,
      backUrl,
    });
    await registrarInicioAssinatura({ clienteId: cliente.id, preapprovalId: id, valorCentavos });
    return NextResponse.json({ init_point });
  } catch (e) {
    return NextResponse.json(
      { erro: e instanceof Error ? e.message : 'Falha ao iniciar a assinatura.' },
      { status: 502 },
    );
  }
}
