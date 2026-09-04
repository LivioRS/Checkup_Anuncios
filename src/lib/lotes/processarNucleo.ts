import 'server-only';
import { NextResponse } from 'next/server';
import { MlError } from '@/lib/ml/client';
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
  type LoteComContagens,
  type TipoLote,
} from './fila';

/**
 * Núcleo do worker do lote (planos 024/025), extraído de `POST /api/lote/[id]/processar`
 * (plano 035, f3c3) pra a rota espelho do portal reusar. A única diferença entre admin e portal
 * é o escopo em que os itens rodam (`comConta` × `comContaCliente`) — quem chama resolve isso
 * em `resolverEscopo`, chamado DEPOIS do lote já ter sido lido (então o portal pode conferir
 * `lote.cliente_id` antes de processar qualquer item).
 */
const CONCORRENCIA_PADRAO = 1;

type ItemProcessado = { status: number; resultado: unknown };

/** Roda a operação do lote para UM item. Sempre chamado dentro do escopo de conta certo. */
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

export type ExecutarNoEscopo = <T>(fn: () => Promise<T>) => Promise<T>;
export type ResolverEscopoLote = (lote: LoteComContagens) => NextResponse | ExecutarNoEscopo;

export async function processarPassoDoLote(
  loteId: string,
  resolverEscopo: ResolverEscopoLote,
): Promise<NextResponse> {
  const lote = await buscarLote(loteId);
  if (!lote) return NextResponse.json({ erro: 'lote não encontrado' }, { status: 404 });

  const escopo = resolverEscopo(lote);
  if (escopo instanceof NextResponse) return escopo;

  const itens = await proximosPendentes(loteId, CONCORRENCIA_PADRAO);

  await Promise.all(
    itens.map((item) =>
      escopo(async () => {
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
