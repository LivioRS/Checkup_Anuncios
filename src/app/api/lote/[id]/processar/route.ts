import { NextResponse } from 'next/server';
import { comConta, MlError } from '@/lib/ml/client';
import { carregarDiagnostico } from '@/lib/ml/analise';
import { abrirAnuncio } from '@/lib/ml/dono';
import { nomeDaLoja } from '@/lib/loja';
import { gerarPropostaTitulo } from '@/lib/ml/titulo';
import { gerarPropostaDescricao } from '@/lib/ml/descricao';
import { lerBlocosDaLoja } from '@/lib/lojaBlocos';
import {
  buscarLote,
  proximosPendentes,
  marcarConcluido,
  marcarErro,
  marcarParaRetentar,
  fecharSeCompleto,
  type TipoLote,
} from '@/lib/lotes/fila';

/**
 * Worker do lote (plano 024, card f2c1; estendido no 025, f2c2) — processa um
 * punhado de itens pendentes por chamada e devolve o estado atual. Não é um
 * cron: a Vercel no plano Hobby só permite cron 1x/dia (ver "Why this matters"
 * do plano 024), então quem faz o "tique-taque" é o chamador — repetindo a
 * chamada a este endpoint enquanto o lote não estiver `concluido`. O progresso
 * fica salvo no banco, então parar de chamar só pausa, não perde nada.
 *
 * `lote.tipo` decide o que roda em cada item:
 * - `diagnostico` → `carregarDiagnostico` (leitura; igual ao 024).
 * - `titulo` → `gerarPropostaTitulo` — GERA a proposta de título/MODEL.
 * - `descricao` → `gerarPropostaDescricao` — GERA a sugestão de descrição.
 * Nenhum deles grava no ML: a proposta fica em `lote_itens.resultado` para
 * revisão manual, um anúncio por vez, pelo `PUT` das rotas de sempre.
 */
const CONCORRENCIA_PADRAO = 1;

type ItemProcessado = { status: number; resultado: unknown };

/** Roda a operação do lote para UM item. Sempre chamado dentro de `comConta`. */
async function processarItem(tipo: TipoLote, itemId: string): Promise<ItemProcessado> {
  if (tipo === 'diagnostico') {
    const diagnostico = await carregarDiagnostico(itemId, { ehMinha: true });
    return { status: 200, resultado: diagnostico };
  }

  const { item, conta } = await abrirAnuncio(itemId);

  if (tipo === 'titulo') {
    const r = await gerarPropostaTitulo(item, { temConta: !!conta });
    return { status: r.status, resultado: r.corpo };
  }

  const loja = nomeDaLoja(conta?.seller_id ?? item.seller_id, conta?.apelido);
  const r = await gerarPropostaDescricao({
    itemId,
    item,
    donaSellerId: conta?.seller_id,
    loja,
    body: {},
    carregarBlocos: lerBlocosDaLoja,
  });
  return { status: r.status, resultado: r.corpo };
}

function mensagemDeErro(resultado: unknown): string {
  if (resultado && typeof resultado === 'object' && 'erro' in resultado) {
    const e = (resultado as { erro?: unknown }).erro;
    if (typeof e === 'string') return e;
  }
  return 'a geração não retornou uma proposta utilizável';
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: loteId } = await params;

  const lote = await buscarLote(loteId);
  if (!lote) return NextResponse.json({ erro: 'lote não encontrado' }, { status: 404 });

  const itens = await proximosPendentes(loteId, CONCORRENCIA_PADRAO);

  await Promise.all(
    itens.map((item) =>
      comConta(lote.seller_id, async () => {
        try {
          const { status, resultado } = await processarItem(lote.tipo, item.item_id);
          if (status === 200) {
            await marcarConcluido(item.id, resultado);
          } else {
            await marcarErro(item.id, mensagemDeErro(resultado));
          }
        } catch (e) {
          if (e instanceof MlError && e.status === 429) {
            await marcarParaRetentar(item);
            return;
          }
          await marcarErro(item.id, e instanceof Error ? e.message : String(e));
        }
      }),
    ),
  );

  await fecharSeCompleto(loteId);

  const atual = await buscarLote(loteId);
  return NextResponse.json(atual);
}
