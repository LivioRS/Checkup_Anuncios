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
};

export const ML_API = 'https://api.mercadolibre.com';
