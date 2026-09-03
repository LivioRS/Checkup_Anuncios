import Link from 'next/link';
import { listarClientesComConexoes } from '@/lib/ml/clientAccounts';
import { textoAviso } from '@/lib/portal/avisosOauth';
import { Selo, Secao } from '@/components/ui';

export const dynamic = 'force-dynamic';

/**
 * Tela "conectar sua conta" (plano 022, card f1c3) — atrás da MESMA senha única do painel de
 * hoje. É uma tela de administração pro Livio testar a conexão com clientes que ele mesmo
 * cadastra por SQL (ver `plans/022-oauth-portal-cliente.md`) — não é o portal público da Fase 3.
 * O mapa de `?aviso=...` vive em `src/lib/portal/avisosOauth.ts`, compartilhado com o
 * `/portal/painel` (plano 027, f3c1), que volta pelo mesmo callback.
 */

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string }>;
}) {
  const sp = await searchParams;
  const aviso = textoAviso(sp.aviso);
  const clientes = await listarClientesComConexoes();

  return (
    <>
      <h1>Clientes do portal</h1>
      <p className="sub">
        Contas do Mercado Livre conectadas por cliente. Cadastro de cliente ainda é manual (SQL
        no Supabase) — a tela de cadastro é trabalho do card f1c4.
      </p>

      {aviso ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <Selo nivel={aviso.nivel}>{aviso.texto}</Selo>
        </div>
      ) : null}

      <Secao titulo="Clientes">
        {clientes.length === 0 ? (
          <p className="vazio">Nenhum cliente cadastrado ainda.</p>
        ) : (
          <div className="rolagem">
            <table className="tabela">
              <tbody>
                {clientes.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div style={{ fontWeight: 550 }}>{c.nome}</div>
                      <div style={{ marginTop: 4 }}>
                        <Selo semIcone>{c.email}</Selo>
                      </div>
                    </td>
                    <td>
                      {c.conexoes.length === 0 ? (
                        <span className="vazio">sem conta conectada</span>
                      ) : (
                        c.conexoes.map((cx) => (
                          <div key={cx.seller_id} style={{ marginBottom: 4 }}>
                            <Selo nivel="bom" mono>
                              {cx.apelido ?? cx.seller_id}
                            </Selo>
                          </div>
                        ))
                      )}
                    </td>
                    <td style={{ width: 180, textAlign: 'right' }}>
                      <Link className="btn pequeno" href={`/api/oauth/ml/authorize?cliente_id=${c.id}`}>
                        Conectar conta Mercado Livre
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Secao>
    </>
  );
}
