import { NextResponse } from 'next/server';
import { comConta, getAccount } from '@/lib/ml/client';
import { ML_API } from '@/lib/env';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Sobe uma foto do computador do vendedor pro ML — pra quando não existe uma URL já
 * hospedada (plano 029 só aceitava link). Devolve um `picture_id` que entra em
 * `pictures[].id` no POST /items, no lugar de `pictures[].source` (URL).
 *
 * Mesmo endpoint que `/api/imagens/[id]/route.ts` já usa pra trocar foto de anúncio
 * existente (`POST /pictures/items/upload`), só que aqui roda ANTES do item existir —
 * por isso não passa por `mlFetch` (que fixa `content-type: application/json`; multipart
 * precisa que o `fetch` gere o boundary sozinho) e usa o token da conta direto, como o
 * `/api/imagens/[id]` já faz.
 */

const LIMITE_BYTES = 15 * 1024 * 1024; // 15 MB — mesmo teto do /api/imagens

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ erro: 'Corpo inválido — precisa ser multipart/form-data.' }, { status: 400 });
  }

  const sellerId = String(form.get('seller_id') ?? '').trim();
  const file = form.get('file');

  if (!sellerId) return NextResponse.json({ erro: 'Falta seller_id.' }, { status: 400 });
  if (!(file instanceof File)) {
    return NextResponse.json({ erro: 'Falta o arquivo da foto.' }, { status: 400 });
  }
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ erro: 'Arquivo precisa ser uma imagem (jpg, png, webp…).' }, { status: 400 });
  }
  if (file.size > LIMITE_BYTES) {
    return NextResponse.json({ erro: 'Imagem muito grande (máx. 15 MB).' }, { status: 413 });
  }

  return comConta(sellerId, async () => {
    const conta = await getAccount();
    if (!conta) {
      return NextResponse.json({ erro: 'Conta do Mercado Livre não encontrada.' }, { status: 401 });
    }

    const envio = new FormData();
    envio.append('file', file, file.name || 'foto.jpg');

    let res: Response;
    try {
      res = await fetch(`${ML_API}/pictures/items/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${conta.access_token}`, accept: 'application/json' },
        body: envio,
        cache: 'no-store',
      });
    } catch (e) {
      return NextResponse.json(
        { erro: 'Não consegui falar com o Mercado Livre.', body: { message: e instanceof Error ? e.message : String(e) } },
        { status: 502 },
      );
    }

    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.id) {
      return NextResponse.json({ erro: 'O ML recusou o upload da foto.', body: json }, { status: res.status || 502 });
    }

    return NextResponse.json({ ok: true, id: String(json.id) });
  });
}
