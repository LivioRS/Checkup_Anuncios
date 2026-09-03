import { NextResponse } from 'next/server';
import { supabaseServidor } from '@/lib/supabase/server';

/** Encerra a sessão do cliente do portal (plano 023, card f1c4). */
export async function POST(req: Request) {
  const supabase = await supabaseServidor();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/portal/login', req.url), 303);
}
