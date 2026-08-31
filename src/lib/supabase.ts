import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

let cached: SupabaseClient | null = null;
let fabrica: (() => SupabaseClient | null) | null = null;

/** Permite injetar um cliente falso nos testes. null restaura o comportamento normal. */
export function injetarCliente(f: (() => SupabaseClient | null) | null) {
  fabrica = f;
}

/** Cliente admin (service_role). Só pode ser usado em código de servidor. */
export function db(): SupabaseClient {
  if (fabrica) {
    const f = fabrica();
    if (!f) throw new Error('Cliente Supabase injetado devolveu null');
    return f;
  }
  if (!cached) {
    cached = createClient(env.supabaseUrl, env.supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}
