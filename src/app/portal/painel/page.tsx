import { redirect } from 'next/navigation';
import { supabaseServidor } from '@/lib/supabase/server';
import { textoAviso } from '@/lib/portal/avisosOauth';
import { Selo, Secao } from '@/components/ui';

export const dynamic = 'force-dynamic';

type ClienteRow = { id: number; nome: string; email: string; status: string };
type ConexaoRow = { seller_id: string; apelido: string | null; conectado_em: string };

/**
 * Painel do cliente (plano 023, card f1c4) — deliberadamente mínimo: existe pra provar que a
 * RLS isola por `auth.uid()`, não é o produto final do portal (isso é Fase 3). Consulta
 * `clientes`/`contas_ml_clientes` com o cliente Supabase DA SESSÃO (não `db()`/service_role) —
 * é essa consulta que só devolve a linha do próprio cliente por causa da policy do banco, não
 * por causa de um `WHERE` escrito aqui.
 */
export default async function PortalPainelPage({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string }>;
}) {
  const { aviso: avisoRaw } = await searchParams;
  const aviso = textoAviso(avisoRaw);

  const supabase = await supabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/portal/login');

  const { data: clienteRows } = await supabase
    .from('clientes')
    .select('id, nome, email, status')
    .limit(1);
  const cliente = (clienteRows?.[0] as ClienteRow | undefined) ?? null;

  const conexoes = cliente
    ? ((
        await supabase
          .from('contas_ml_clientes')
          .select('seller_id, apelido, conectado_em')
          .eq('cliente_id', cliente.id)
      ).data as ConexaoRow[] | null) ?? []
    : [];

  return (
    <>
      <h1>Seu painel</h1>
      {!cliente ? (
        <p className="sub">
          Sua conta ainda não tem um cadastro de cliente vinculado. Fale com o suporte.
        </p>
      ) : (
        <>
          <p className="sub">
            {cliente.nome} · {cliente.email} · <Selo nivel={cliente.status === 'ativo' ? 'bom' : 'atencao'}>{cliente.status}</Selo>
          </p>

          {aviso ? (
            <div className="card" style={{ marginBottom: 16 }}>
              <Selo nivel={aviso.nivel}>{aviso.texto}</Selo>
            </div>
          ) : null}

          {conexoes.length > 0 ? (
            <p style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <a className="btn primary" href="/portal/criar">
                Criar anúncio
              </a>
              <a className="btn" href="/portal/lote">
                Operação em lote
              </a>
            </p>
          ) : null}

          <Secao
            titulo="Contas do Mercado Livre conectadas"
            acao={
              <a className="btn pequeno" href="/api/portal/ml/conectar">
                Conectar conta do Mercado Livre
              </a>
            }
          >
            {conexoes.length === 0 ? (
              <p className="sub">Nenhuma conta conectada ainda.</p>
            ) : (
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Apelido</th>
                    <th>Seller ID</th>
                    <th>Conectado em</th>
                  </tr>
                </thead>
                <tbody>
                  {conexoes.map((c) => (
                    <tr key={c.seller_id}>
                      <td>{c.apelido ?? '—'}</td>
                      <td>{c.seller_id}</td>
                      <td>{new Date(c.conectado_em).toLocaleDateString('pt-BR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Secao>
        </>
      )}

      <form method="post" action="/api/portal/logout" style={{ marginTop: 24 }}>
        <button className="btn" type="submit">Sair</button>
      </form>
    </>
  );
}
