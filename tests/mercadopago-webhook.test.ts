import { describe, expect, it } from 'vitest';
import { validarAssinaturaWebhook } from '../src/lib/mercadopago/webhook';

/**
 * Plano 036 (f3c6) — validação do `x-signature` do Mercado Pago. Mesmo princípio de segurança
 * do §1 (nunca confiar em dado externo sem verificar), aplicado a dinheiro em vez de token.
 */

async function assinar(manifesto: string, segredo: string): Promise<string> {
  const chave = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(segredo),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(manifesto));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const SEGREDO = 'segredo-de-teste';

async function headerValido(dataId: string, requestId: string, ts = '1700000000') {
  const manifesto = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const v1 = await assinar(manifesto, SEGREDO);
  return `ts=${ts},v1=${v1}`;
}

describe('validarAssinaturaWebhook', () => {
  it('aceita uma assinatura válida', async () => {
    const dataId = '123456789';
    const requestId = 'req-1';
    const xSignature = await headerValido(dataId, requestId);

    const ok = await validarAssinaturaWebhook({ xSignature, xRequestId: requestId, dataId, segredo: SEGREDO });
    expect(ok).toBe(true);
  });

  it('rejeita quando o segredo não bate', async () => {
    const dataId = '123456789';
    const requestId = 'req-1';
    const xSignature = await headerValido(dataId, requestId);

    const ok = await validarAssinaturaWebhook({
      xSignature,
      xRequestId: requestId,
      dataId,
      segredo: 'segredo-errado',
    });
    expect(ok).toBe(false);
  });

  it('rejeita quando o data.id foi adulterado (mesma assinatura, id diferente)', async () => {
    const requestId = 'req-1';
    const xSignature = await headerValido('123456789', requestId);

    const ok = await validarAssinaturaWebhook({
      xSignature,
      xRequestId: requestId,
      dataId: '999999999',
      segredo: SEGREDO,
    });
    expect(ok).toBe(false);
  });

  it('rejeita quando o x-request-id foi adulterado', async () => {
    const dataId = '123456789';
    const xSignature = await headerValido(dataId, 'req-1');

    const ok = await validarAssinaturaWebhook({
      xSignature,
      xRequestId: 'req-2-diferente',
      dataId,
      segredo: SEGREDO,
    });
    expect(ok).toBe(false);
  });

  it('rejeita header ausente/malformado', async () => {
    expect(await validarAssinaturaWebhook({ xSignature: null, xRequestId: 'r', dataId: 'x', segredo: SEGREDO })).toBe(false);
    expect(await validarAssinaturaWebhook({ xSignature: 'lixo-sem-formato', xRequestId: 'r', dataId: 'x', segredo: SEGREDO })).toBe(false);
    expect(await validarAssinaturaWebhook({ xSignature: 'ts=1,v1=', xRequestId: 'r', dataId: 'x', segredo: SEGREDO })).toBe(false);
  });

  it('é insensível a maiúscula/minúscula no data.id (o manifesto usa minúsculo)', async () => {
    const requestId = 'req-1';
    const xSignature = await headerValido('abc123', requestId);

    const ok = await validarAssinaturaWebhook({
      xSignature,
      xRequestId: requestId,
      dataId: 'ABC123',
      segredo: SEGREDO,
    });
    expect(ok).toBe(true);
  });
});
