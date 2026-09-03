import { createBrowserClient } from '@supabase/ssr';

/**
 * Cliente Supabase pro browser (plano 023, card f1c4) — usado só em Client Components do
 * namespace `/portal/*` (cadastro, login). Usa a chave ANÔNIMA, feita pra ir no bundle do
 * cliente — nunca a `service_role`. As queries feitas com esse cliente respeitam RLS pela
 * sessão do usuário logado, não têm acesso amplo como `db()` em `src/lib/supabase.ts`.
 */
export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
