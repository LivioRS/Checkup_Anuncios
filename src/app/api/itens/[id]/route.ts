import { NextResponse } from 'next/server';
import { mlFetch, MlError, comConta } from '@/lib/ml/client';
import { abrirAnuncio } from '@/lib/ml/dono';
import { getItem } from '@/lib/ml/attributes';
import { garantirDono, registrarEscrita } from '@/lib/auditoria';
import type { OutAttribute } from '@/lib/ml/model';

export const dynamic = 'force-dynamic';

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { attributes?: OutAttribute[] } | null;
  const attributes = body?.attributes ?? [];

  if (!Array.isArray(attributes) || attributes.length === 0) {
    return NextResponse.json({ erro: 'Nenhum atributo para enviar.' }, { status: 400 });
  }

  // Garante dono e obtém item/conta
  const { item, conta } = await garantirDono(id, { internos: true });

  // Guarda o "antes" apenas dos atributos tocados, para o log.
  let antes: OutAttribute[] = [];
  let categoryId: string | null = null;
  try {
    const atual = await getItem(id, { internos: true });
    const alvo = new Set(attributes.map((a) => a.id));
    antes = (atual.attributes ?? [])
      .filter((a) => new Set(attributes.map((a) => a.id)).has(a.id))
      .map((a) => ({ id: a.id, value_id: a.value_id ?? null, value_name: a.value_name ?? null }));
  } catch {
    /* log é best-effort */
  }

  try {
    const atualizado = await mlFetch(`/items/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ attributes }),
    });

    await registrarEscrita({
      conta,
      itemId: id,
      payload: attributes,
      antes,
      status: 200,
    });

    return NextResponse.json({ ok: true, item: atualizado });
  } catch (e) {
    const status = e instanceof MlError ? e.status : 500;
    const corpo = e instanceof MlError ? e.body : { message: String(e) };

    await registrarEscrita({
      conta,
      itemId: id,
      payload: attributes,
      antes: [],
      status,
    });

    return NextResponse.json({ erro: 'Falha no PUT do item', body: corpo }, { status });
  }
}