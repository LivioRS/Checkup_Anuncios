import { NextResponse } from 'next/server';
import { getAccount, contaDoAnuncio } from '@/lib/ml/client';
import { db } from '@/lib/supabase';
import { nomeDaLoja, sugerirSobre, sugerirGarantia } from '@/lib/loja';

export const dynamic = 'force-dynamic';

/**
 * Blocos fixos da loja: "sobre a loja" e "garantia".
 * Preenchidos uma vez por conta e anexados ao fim de toda descrição gerada.
 */

export async function GET(req: Request) {
  // O bloco é por CONTA. Quando a tela informa de qual anúncio veio, usamos a
  // conta dona dele; senão, a padrão.
  const pedido = new URL(req.url).searchParams.get('seller_id');
  const conta = (pedido ? await contaDoAnuncio(pedido) : null) ?? (await getAccount());
  if (!conta) return NextResponse.json({ erro: 'sem conta' }, { status: 401 });

  const { data } = await db()
    .from('loja_blocos')
    .select('sobre, garantia, atualizado_em')
    .eq('seller_id', conta.seller_id)
    .maybeSingle();

  const loja = nomeDaLoja(conta.seller_id, conta.apelido);

  /**
   * Campo vazio já vem com rascunho.
   *
   * Tela em branco é o que faz esses dois blocos ficarem eternamente sem
   * preencher. Vindo escrito, o trabalho vira revisar em vez de começar — e a
   * tela deixa claro que é sugestão, para ninguém publicar prazo que não pratica.
   */
  return NextResponse.json({
    loja,
    seller_id: conta.seller_id,
    sobre: data?.sobre ?? '',
    garantia: data?.garantia ?? '',
    sugestao: { sobre: sugerirSobre(loja), garantia: sugerirGarantia() },
    salvo: !!(data?.sobre || data?.garantia),
  });
}

export async function PUT(req: Request) {
  const pedido = new URL(req.url).searchParams.get('seller_id');
  const conta = (pedido ? await contaDoAnuncio(pedido) : null) ?? (await getAccount());
  if (!conta) return NextResponse.json({ erro: 'sem conta' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { sobre?: string; garantia?: string };

  const { error } = await db()
    .from('loja_blocos')
    .upsert(
      {
        seller_id: conta.seller_id,
        sobre: (body.sobre ?? '').trim().slice(0, 4000),
        garantia: (body.garantia ?? '').trim().slice(0, 4000),
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: 'seller_id' },
    );

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
