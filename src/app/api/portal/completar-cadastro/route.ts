import { NextResponse } from 'next/server';
import { clienteAutenticado } from '@/lib/supabase/server';
import { criarRegistroCliente, ClienteJaCadastradoError } from '@/lib/portal/cadastro';

/**
 * Segundo passo do cadastro (plano 023, card f1c4): chamado pelo browser logo depois que
 * `supabase.auth.signUp()` já criou o `auth.users` e devolveu sessão. Grava a linha em
 * `clientes` com `service_role` — não existe policy de `insert` pra `authenticated` de
 * propósito (ver `src/lib/portal/cadastro.ts`).
 */
export async function POST(req: Request) {
  const user = await clienteAutenticado();
  if (!user || !user.email) {
    return NextResponse.json({ erro: 'não autenticado' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const nome = String(body?.nome ?? '').trim();
  if (!nome) {
    return NextResponse.json({ erro: 'nome é obrigatório' }, { status: 400 });
  }

  try {
    await criarRegistroCliente({ authUserId: user.id, email: user.email, nome });
  } catch (e) {
    if (e instanceof ClienteJaCadastradoError) {
      return NextResponse.json({ erro: e.message }, { status: 409 });
    }
    return NextResponse.json({ erro: 'falha ao concluir cadastro' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
