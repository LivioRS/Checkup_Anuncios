import { ML_API, env } from '../env';

/**
 * O painel NÃO faz o fluxo de autorização — quem autoriza são os robôs do
 * dashboard-ml-bot, e o token vive na tabela `contas`. Aqui só existe o refresh,
 * porque o access_token dura 6 h e alguém precisa renovar quando vence durante o uso.
 *
 * Atenção: o refresh_token do ML é de USO ÚNICO. Toda renovação grava o par novo
 * em `contas` na mesma hora — é o que mantém os robôs funcionando.
 */

export type TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number; // 21600 = 6h
  scope: string;
  user_id: number;
  refresh_token: string;
};

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch(`${ML_API}/oauth/token`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: env.clientId,
      client_secret: env.clientSecret,
      refresh_token: refreshToken,
    }).toString(),
    cache: 'no-store',
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `OAuth ${res.status}: ${json?.error ?? ''} ${json?.error_description ?? JSON.stringify(json)}`,
    );
  }
  return json as TokenResponse;
}

const ML_AUTH = 'https://auth.mercadolivre.com.br';

/**
 * Fluxo `authorization_code` — só o app do PORTAL usa isto (plano 022, card f1c3). Constrói a
 * URL de `/authorization` com o client_id/redirect_uri do portal, nunca os dos robôs.
 */
export function buildAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: env.clientIdPortal,
    redirect_uri: env.redirectUriPortal,
    state,
  });
  return `${ML_AUTH}/authorization?${params.toString()}`;
}

/** Troca o `code` do fluxo `authorization_code` por tokens — grant separado do refresh acima. */
export async function exchangeCodeForToken(code: string): Promise<TokenResponse> {
  const res = await fetch(`${ML_API}/oauth/token`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: env.clientIdPortal,
      client_secret: env.clientSecretPortal,
      code,
      redirect_uri: env.redirectUriPortal,
    }).toString(),
    cache: 'no-store',
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `OAuth ${res.status}: ${json?.error ?? ''} ${json?.error_description ?? JSON.stringify(json)}`,
    );
  }
  return json as TokenResponse;
}

const JANELA_STATE_MS = 10 * 60 * 1000; // 10 min — só o tempo de ida-e-volta no navegador até o ML

/**
 * `state` assinado carregando o `cliente_id`. O callback do ML não devolve nada além de
 * `code`/`state` — é o `state` que diz pra qual cliente a conexão pertence, sem confiar em query
 * string não assinada. Mesma técnica HMAC de `crypto.ts` (`assinarSessao`/`verificarSessao`),
 * mas específica do OAuth: janela curta (10 min, não 30 dias) e payload numérico, não sessão.
 */
async function segredoState(): Promise<CryptoKey> {
  const s = process.env.PANEL_HMAC_SECRET ?? `dev-${process.env.PANEL_PASSWORD ?? ''}`;
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(`state:${s}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function bytesParaHex(b: ArrayBuffer): string {
  return Array.from(new Uint8Array(b))
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}

function hexParaBytes(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

export async function assinarState(clienteId: number, agora = Date.now()): Promise<string> {
  const payload = `${clienteId}.${agora + JANELA_STATE_MS}`;
  const chave = await segredoState();
  const sig = await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(payload));
  return `${payload}.${bytesParaHex(sig)}`;
}

/** `null` quando adulterado, expirado ou malformado — o chamador decide o que fazer. */
export async function verificarState(state: string, agora = Date.now()): Promise<number | null> {
  const partes = state.split('.');
  if (partes.length !== 3) return null;
  const [clienteIdRaw, expRaw, sig] = partes;
  const clienteId = Number(clienteIdRaw);
  const exp = Number(expRaw);
  if (!Number.isFinite(clienteId) || !Number.isFinite(exp) || exp <= agora) return null;

  const chave = await segredoState();
  let ok = false;
  try {
    ok = await crypto.subtle.verify(
      'HMAC',
      chave,
      hexParaBytes(sig),
      new TextEncoder().encode(`${clienteIdRaw}.${expRaw}`),
    );
  } catch {
    return null;
  }
  return ok ? clienteId : null;
}
