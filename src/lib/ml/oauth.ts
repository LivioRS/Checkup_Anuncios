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
