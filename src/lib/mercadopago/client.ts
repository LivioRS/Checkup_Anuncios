import 'server-only';
import { env } from '../env';

/**
 * Adapter (AGENTS.md §11) — fala com a API de assinaturas (`preapproval`) do Mercado Pago
 * (plano 036, f3c6). Sem plano associado de propósito: preço único, então criar o `preapproval`
 * direto (com `auto_recurring` inline) evita o passo extra de `preapproval_plan`.
 */
const MP_API = 'https://api.mercadopago.com';

export function temCobranca(): boolean {
  return !!(process.env.MERCADOPAGO_ACCESS_TOKEN && process.env.MERCADOPAGO_WEBHOOK_SECRET);
}

type PreapprovalCriado = { id: string; init_point: string };

/**
 * Cria uma assinatura em checkout hospedado — o cliente escolhe/cadastra o cartão na PÁGINA do
 * Mercado Pago (`init_point`), nunca aqui. `status: 'pending'` até o cliente concluir; o webhook
 * (`src/lib/mercadopago/webhook.ts`) avisa quando virar `authorized`.
 */
export async function criarAssinatura(input: {
  clienteId: number;
  email: string;
  backUrl: string;
}): Promise<PreapprovalCriado> {
  const res = await fetch(`${MP_API}/preapproval`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.mercadoPagoAccessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      reason: 'Checkup Anúncios — assinatura do portal',
      payer_email: input.email,
      back_url: input.backUrl,
      // `external_reference` volta em toda notificação/consulta — é como o webhook acha o
      // cliente sem precisar confiar em nada que o corpo da notificação diga sobre "quem é".
      external_reference: String(input.clienteId),
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: env.mercadoPagoPlanoValorCentavos / 100,
        currency_id: 'BRL',
      },
      status: 'pending',
    }),
  });

  const texto = await res.text();
  const corpo = texto ? safeJson(texto) : null;
  if (!res.ok) {
    throw new Error(`Mercado Pago recusou a criação da assinatura (HTTP ${res.status}): ${texto.slice(0, 400)}`);
  }
  const c = corpo as { id?: string; init_point?: string };
  if (!c?.id || !c?.init_point) {
    throw new Error('Mercado Pago não devolveu id/init_point da assinatura.');
  }
  return { id: c.id, init_point: c.init_point };
}

/**
 * Confirma o status ATUAL direto na API — o webhook nunca deve confiar só no que a notificação
 * diz (ela só avisa "algo mudou", não é a fonte da verdade).
 */
export async function buscarAssinaturaMp(preapprovalId: string): Promise<{
  status: string;
  externalReference: string | null;
}> {
  const res = await fetch(`${MP_API}/preapproval/${encodeURIComponent(preapprovalId)}`, {
    headers: { Authorization: `Bearer ${env.mercadoPagoAccessToken}` },
    cache: 'no-store',
  });
  const texto = await res.text();
  if (!res.ok) {
    throw new Error(`Mercado Pago recusou a consulta da assinatura (HTTP ${res.status}): ${texto.slice(0, 400)}`);
  }
  const corpo = safeJson(texto) as { status?: string; external_reference?: string };
  return { status: corpo?.status ?? 'desconhecido', externalReference: corpo?.external_reference ?? null };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
