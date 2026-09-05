function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente ausente: ${name}. Confira o .env.local`);
  return v;
}

export const env = {
  /** Mesmo App ID / Secret que os robôs usam — o Brasil só permite 1 aplicação por conta. */
  get clientId() {
    return req('ML_CLIENT_ID');
  },
  get clientSecret() {
    return req('ML_CLIENT_SECRET');
  },
  get supabaseUrl() {
    return req('SUPABASE_URL');
  },
  get supabaseServiceKey() {
    return req('SUPABASE_SERVICE_ROLE_KEY');
  },
  get panelPassword() {
    return req('PANEL_PASSWORD');
  },

  /**
   * App SEPARADO do dos robôs (plano 022, card f1c3) — dedicado ao portal multi-cliente.
   * Cada app do Mercado Livre só aceita 1 redirect_uri cadastrado; reaproveitar o app dos robôs
   * faria o redirect_uri do portal colidir com o deles. Ver AGENTS.md §1 e `.env.example`.
   */
  get clientIdPortal() {
    return req('ML_CLIENT_ID_PORTAL');
  },
  get clientSecretPortal() {
    return req('ML_CLIENT_SECRET_PORTAL');
  },
  get redirectUriPortal() {
    return req('ML_REDIRECT_URI_PORTAL');
  },

  /**
   * Cobrança do portal via Mercado Pago — assinaturas (plano 036, f3c6). Token/segredo de uma
   * aplicação própria do MP (não confundir com credenciais do app do ML). Sem essas duas, as
   * rotas de assinatura devolvem 503 (mesmo padrão de `temIA()`/`temBuscaWeb()`).
   */
  get mercadoPagoAccessToken() {
    return req('MERCADOPAGO_ACCESS_TOKEN');
  },
  get mercadoPagoWebhookSecret() {
    return req('MERCADOPAGO_WEBHOOK_SECRET');
  },
  /**
   * Preço do plano único, em centavos — constante fácil de trocar sem mexer em código
   * (`MERCADOPAGO_PLANO_VALOR_CENTAVOS` no `.env`). Default 9700 = R$ 97,00, só um placeholder;
   * o valor final é decisão do Livio.
   */
  get mercadoPagoPlanoValorCentavos(): number {
    const bruto = process.env.MERCADOPAGO_PLANO_VALOR_CENTAVOS;
    const n = bruto ? Number(bruto) : 9700;
    return Number.isFinite(n) && n > 0 ? n : 9700;
  },
};

/**
 * `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` (plano 023, card f1c4) NÃO passam
 * por `env` acima de propósito: o Next.js só consegue trocar `process.env.NEXT_PUBLIC_X` pelo
 * valor literal no bundle do browser quando enxerga essa expressão escrita por extenso no
 * arquivo — reexportar por um getter quebraria isso. `src/lib/supabase/browser.ts`, `server.ts`
 * e `middleware.ts` leem `process.env.NEXT_PUBLIC_...` diretamente. A chave anônima não é
 * segredo (foi feita pra ir no bundle do client) — ver `.env.example`.
 */

export const ML_API = 'https://api.mercadolibre.com';
