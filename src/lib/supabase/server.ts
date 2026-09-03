import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { SupabaseClient, User } from '@supabase/supabase-js';

/**
 * Cliente Supabase por requisição, lendo/gravando a sessão via cookies (plano 023, card f1c4).
 * Usa a chave ANÔNIMA — não `service_role` — de propósito: as queries feitas com esse cliente
 * respeitam RLS pela sessão de quem está logado (`/portal/*`). Diferente de `db()` em
 * `src/lib/supabase.ts`, que ignora RLS.
 */
export async function supabaseServidor(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Chamado a partir de um Server Component (sem permissão de escrever cookie) — a
            // sessão já foi renovada no middleware nesse caso, então é seguro ignorar aqui.
          }
        },
      },
    },
  );
}

/** `null` quando não há sessão válida — o chamador decide (redirecionar, 401, etc.). */
export async function clienteAutenticado(): Promise<User | null> {
  const supabase = await supabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
