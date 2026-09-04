import Link from 'next/link';
import { buscarLote, listarItensDoLote } from '@/lib/lotes/fila';
import { Secao } from '@/components/ui';
import AcompanharLote from './AcompanharLote';

export const dynamic = 'force-dynamic';

/** Progresso de um lote (plano 026, card f2c3). */
export default async function LoteDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const lote = await buscarLote(id).catch(() => null);
  if (!lote) {
    return (
      <Secao titulo="Lote não encontrado">
        <p style={{ margin: 0 }}>
          Não existe lote com o id <code>{id}</code>.
        </p>
        <p style={{ marginTop: 10 }}>
          <Link className="btn pequeno" href="/lote">
            Criar um lote
          </Link>
        </p>
      </Secao>
    );
  }

  const itens = await listarItensDoLote(id).catch(() => []);

  return (
    <>
      <h1>Lote em {lote.tipo}</h1>
      <p className="sub">
        <code>{id}</code>
      </p>
      <AcompanharLote loteId={id} loteInicial={lote} itensIniciais={itens} />
    </>
  );
}
