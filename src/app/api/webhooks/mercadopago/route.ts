import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { validarAssinaturaWebhook } from '@/lib/mercadopago/webhook';
import { buscarAssinaturaMp } from '@/lib/mercadopago/client';
import { atualizarStatusAssinatura, type Assinatura } from '@/lib/portal/assinatura';

export const dynamic = 'force-dynamic';

/**
 * Notificação de assinatura do Mercado Pago (plano 036, f3c6) — rota PÚBLICA de propósito (é o
 * MP chamando; não tem sessão de cliente aqui). Autenticada só por `x-signature`, nunca por
 * cookie/senha — mesmo princípio de segurança do §1, aplicado a dinheiro em vez de token: uma
 * notificação sem assinatura válida NUNCA toca o banco.
 *
 * Sempre responde 200 (ou 401 se a assinatura for inválida) — o MP reenvia com backoff se não
 * receber confirmação em ~22s; um preapproval que não é nosso (webhook de teste, ambiente
 * errado) também responde 200 pra não virar retry infinito.
 */
const STATUS_VALIDOS = new Set<Assinatura['status']>(['pendente', 'authorized', 'paused', 'cancelled']);

export async function POST(req: Request) {
  if (!process.env.MERCADOPAGO_WEBHOOK_SECRET) {
    return NextResponse.json({ erro: 'Cobrança não configurada.' }, { status: 503 });
  }

  const url = new URL(req.url);
  const body = await req.json().catch(() => ({}) as Record<string, unknown>);

  const tipo = String(url.searchParams.get('type') ?? (body as { type?: string }).type ?? '');
  const dataId = String(
    url.searchParams.get('data.id') ?? (body as { data?: { id?: string } }).data?.id ?? '',
  );

  const valido = await validarAssinaturaWebhook({
    xSignature: req.headers.get('x-signature'),
    xRequestId: req.headers.get('x-request-id'),
    dataId,
    segredo: env.mercadoPagoWebhookSecret,
  });
  if (!valido) {
    return NextResponse.json({ erro: 'assinatura inválida' }, { status: 401 });
  }

  // Só `subscription_preapproval` interessa aqui: é o único tópico cujo `data.id` é o
  // `preapproval_id` direto. `subscription_authorized_payment` (cada cobrança recorrente
  // individual) teria `data.id` de um PAGAMENTO — id diferente, fora de escopo deste plano
  // (não fazemos rastreio de cobrança por cobrança, só o status da assinatura).
  if (!dataId || tipo !== 'subscription_preapproval') {
    return NextResponse.json({ ok: true });
  }

  try {
    // Nunca confia no que a notificação diz sobre o status — busca o estado ATUAL na API.
    const atual = await buscarAssinaturaMp(dataId);
    const status = STATUS_VALIDOS.has(atual.status as Assinatura['status'])
      ? (atual.status as Assinatura['status'])
      : 'pendente';
    await atualizarStatusAssinatura(dataId, status);
  } catch {
    // Best-effort: um erro aqui não deve travar a confirmação (o MP reenvia; se o preapproval
    // não existir mais/não for nosso, não há nada a atualizar).
  }

  return NextResponse.json({ ok: true });
}
