import { redirect } from 'next/navigation';
import Link from 'next/link';
import { supabaseServidor } from '@/lib/supabase/server';
import { loteDoCliente } from '@/lib/lotes/autorizacao';
import { listarItensDoLote } from '@/lib/lotes/fila';
import { Secao } from '@/components/ui';
import AcompanharLote from '@/app/lote/[id]/AcompanharLote';

export const dynamic = 'force-dynamic';

/**
 * Progresso de um lote pelo PORTAL do cliente (plano 035, f3c3). Diferente da página admin: usa
 * `loteDoCliente` (não `buscarLote` direto) — lote de outro cliente ou dos robôs cai na mesma
 * tela de "não encontrado" que um id inexistente (não revela qual dos dois).
 */
export default async function PortalLoteDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await supabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/portal/login');

  const { data: clienteRows } = await supabase.from('clientes').select('id').limit(1);
  const clienteId = (clienteRows?.[0] as { id: number } | undefined)?.id;

  const lote = clienteId ? await loteDoCliente(id, clienteId).catch(() => null) : null;
  if (!lote) {
    return (
      <Secao titulo="Lote não encontrado">
        <p style={{ margin: 0 }}>
          Não existe lote com o id <code>{id}</code>.
        </p>
        <p style={{ marginTop: 10 }}>
          <Link className="btn pequeno" href="/portal/lote">
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
      <AcompanharLote
        loteId={id}
        loteInicial={lote}
        itensIniciais={itens}
        base="/api/portal/lote"
        rotaIndice="/portal/lote"
        ferramentasInternas={false}
      />
    </>
  );
}
