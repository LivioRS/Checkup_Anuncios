import 'server-only';
import { igualSegura } from '../crypto';

const TEXTO = new TextEncoder();

/**
 * Valida o header `x-signature` das notificações do Mercado Pago (plano 036, f3c6) — mesmo
 * princípio de segurança do §1 (nunca confiar em dado externo sem verificar), aplicado a
 * dinheiro/acesso em vez de token.
 *
 * Formato do header: `ts=<epoch>,v1=<hex>`. Manifesto assinado:
 * `id:<dataId minúsculo>;request-id:<x-request-id>;ts:<ts>;` — HMAC-SHA256 com o webhook secret
 * (Web Crypto, mesmo padrão de `src/lib/crypto.ts`), comparado em tempo constante.
 */
export async function validarAssinaturaWebhook(input: {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string;
  segredo: string;
}): Promise<boolean> {
  const { xSignature, xRequestId, dataId, segredo } = input;
  if (!xSignature || !xRequestId || !dataId) return false;

  const partes = Object.fromEntries(
    xSignature.split(',').map((p) => {
      const [k, ...v] = p.trim().split('=');
      return [k, v.join('=')];
    }),
  );
  const ts = partes.ts;
  const v1 = partes.v1;
  if (!ts || !v1) return false;

  const manifesto = `id:${dataId.toLowerCase()};request-id:${xRequestId};ts:${ts};`;

  const chave = await crypto.subtle.importKey(
    'raw',
    TEXTO.encode(segredo),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const assinatura = await crypto.subtle.sign('HMAC', chave, TEXTO.encode(manifesto));
  const esperado = bytesParaHex(assinatura);

  return igualSegura(esperado, v1.toLowerCase());
}

function bytesParaHex(b: ArrayBuffer): string {
  return Array.from(new Uint8Array(b))
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}
