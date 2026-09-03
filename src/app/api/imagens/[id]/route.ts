import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { mlFetch, MlError, comConta } from '@/lib/ml/client';
import { donoDoAnuncio, abrirAnuncio } from '@/lib/ml/dono';
import { ML_API } from '@/lib/env';
import type { Item } from '@/lib/ml/model';
import { diagnosticarImagens } from '@/lib/ml/analise';
import { registrarEscrita } from '@/lib/auditoria';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** GET — roda o diagnóstico oficial de imagem, uma chamada por foto. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const { item, conta } = await abrirAnuncio(id);
    const fotos = await comConta(conta?.seller_id, () => diagnosticarImagens(item));
    return NextResponse.json({ fotos });
  } catch (e) {
    const status = e instanceof MlError ? e.status : 500;
    return NextResponse.json(
      { erro: e instanceof Error ? e.message : String(e) },
      { status },
    );
  }
}

const LADO = 1200; // tamanho recomendado pelo ML; o mínimo aceito é 500

/**
 * Duas operações, as duas sem inventar pixel de produto:
 *
 *  - 'proporcional' (padrão): reamostra a foto para 1200 no maior lado,
 *    mantendo a proporção. Não acrescenta nada à imagem — só muda a escala.
 *    É o que resolve o apontamento de tamanho mínimo.
 *
 *  - 'quadrado': monta o quadrado 1200x1200 com fundo branco em volta.
 *    SÓ é permitido na primeira foto (a capa), porque fundo branco é exigência
 *    de capa e nem toda categoria cobra. Em foto de ambiente, de detalhe ou de
 *    uso, barra branca estraga o anúncio.
 *
 * Texto na imagem, logo e marca d'água não são tratados aqui: corrigir isso
 * exigiria redesenhar a foto, e aí sim seria inventar.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    picture_id?: string;
    modo?: 'proporcional' | 'quadrado';
  };
  const pictureId = body.picture_id;
  const modo = body.modo === 'quadrado' ? 'quadrado' : 'proporcional';
  if (!pictureId) return NextResponse.json({ erro: 'picture_id ausente' }, { status: 400 });

  const { item, conta } = await abrirAnuncio(id);
  if (!conta) {
    return NextResponse.json(
      { erro: 'Este anúncio não é de nenhuma conta cadastrada — o painel só lê.' },
      { status: 403 },
    );
  }

  let origem: string | null = null;

  try {
    const item = await mlFetch<Item>(`/items/${id}`);
    const fotos = item.pictures ?? [];
    const posicao = fotos.findIndex((f) => f.id === pictureId);
    const alvo = fotos[posicao];
    if (!alvo) return NextResponse.json({ erro: 'foto não pertence a este anúncio' }, { status: 404 });

    // Trava de segurança: fundo branco é coisa de capa.
    if (modo === 'quadrado' && posicao !== 0) {
      return NextResponse.json(
        {
          erro:
            'Fundo branco só se aplica à foto de capa. Nas demais, use o redimensionamento proporcional.',
        },
        { status: 422 },
      );
    }

    // 1. baixa a maior versão disponível
    origem = (alvo.max_size ? alvo.secure_url ?? alvo.url : alvo.secure_url ?? alvo.url) ?? null;
    if (!origem) return NextResponse.json({ erro: 'foto sem URL' }, { status: 422 });
    // Teto de bytes antes de decodificar: evita OOM/estourar a janela de 60s
    // com imagem gigante ou decompression-bomb.
    const LIMITE_BYTES = 15 * 1024 * 1024; // 15 MB
    const bin = await fetch(origem, { cache: 'no-store' });
    if (!bin.ok) return NextResponse.json({ erro: `download HTTP ${bin.status}` }, { status: 502 });
    const cl = Number(bin.headers.get('content-length') ?? 0);
    if (cl > LIMITE_BYTES) return NextResponse.json({ erro: 'imagem muito grande' }, { status: 413 });
    const entradaBytes = Buffer.from(await bin.arrayBuffer());
    if (entradaBytes.byteLength > LIMITE_BYTES) {
      return NextResponse.json({ erro: 'imagem muito grande' }, { status: 413 });
    }

    // 2. reamostra (com teto de pixels para não decodificar bomb)
    const LIMITE_PIXELS = 8192 * 8192;
    const entrada = entradaBytes;
    const meta = await sharp(entrada, { limitInputPixels: LIMITE_PIXELS }).metadata();
    const base = sharp(entrada, { limitInputPixels: LIMITE_PIXELS });

    const saida =
      modo === 'quadrado'
        ? await base
            .flatten({ background: { r: 255, g: 255, b: 255 } })
            .resize(LADO, LADO, {
              fit: 'contain',
              background: { r: 255, g: 255, b: 255 },
              kernel: 'lanczos3',
              withoutEnlargement: false,
            })
            .jpeg({ quality: 92, chromaSubsampling: '4:4:4', mozjpeg: true })
            .toBuffer()
        : await base
            // fit 'inside' não acrescenta nada: só reescala mantendo a proporção
            .resize(LADO, LADO, { fit: 'inside', kernel: 'lanczos3', withoutEnlargement: false })
            .jpeg({ quality: 92, chromaSubsampling: '4:4:4', mozjpeg: true })
            .toBuffer();

    const metaSaida = await sharp(saida).metadata();

    // 3. sobe como imagem nova (o upload é multipart)
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(saida)], { type: 'image/jpeg' }),
      `${pictureId}-${modo}-${LADO}.jpg`,
    );

    const up = await fetch(`${ML_API}/pictures/items/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${conta.access_token}`, accept: 'application/json' },
      body: form,
      cache: 'no-store',
    });
    const upJson = await up.json().catch(() => ({}));
    if (!up.ok || !upJson?.id) {
      return NextResponse.json({ erro: 'falha no upload', body: upJson }, { status: up.status || 502 });
    }

    // 4. troca no anúncio preservando a ordem das demais
    const novas = item.pictures?.map((f) => (f.id === pictureId ? { id: upJson.id as string } : { id: f.id })) ?? [];
    await mlFetch(`/items/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ pictures: novas }),
    });

    await registrarEscrita({
      conta,
      itemId: id,
      payload: { imagem_nova: upJson.id, posicao: fotos.findIndex((f) => f.id === pictureId), modo },
      antes: { imagem_antiga: pictureId, url: origem },
      status: 200,
    });

    return NextResponse.json({
      ok: true,
      picture_id: upJson.id,
      modo,
      antes: `${meta.width ?? '?'}x${meta.height ?? '?'}`,
      depois: `${metaSaida.width ?? '?'}x${metaSaida.height ?? '?'}`,
    });
  } catch (e) {
    const status = e instanceof MlError ? e.status : 500;
    const corpo = e instanceof MlError ? e.body : { message: String(e) };
    await registrarEscrita({
      conta,
      itemId: id,
      payload: { modo },
      antes: { imagem_antiga: pictureId, url: origem },
      status,
    });
    return NextResponse.json({ erro: 'não consegui corrigir a imagem', body: corpo }, { status });
  }
}