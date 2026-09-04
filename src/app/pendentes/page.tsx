'use client';

import { useEffect, useState } from 'react';
import { Selo, Secao } from '@/components/ui';

type Pendente = { id: string; titulo: string | null; status: string | null; permalink: string | null };
type ContaComPendentes = { seller_id: string; apelido: string | null; itens: Pendente[]; erro: string | null };

/**
 * Um lugar só pra ver todos os anúncios pausados — criados pelo "Criar anúncio"
 * ou pausados por outro motivo, de todas as contas cadastradas. O app nunca
 * ativa nada sozinho: "Ativar" aqui é sempre clique do usuário.
 */
export default function PendentesPage() {
  const [contas, setContas] = useState<ContaComPendentes[] | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [ativando, setAtivando] = useState<string | null>(null);
  const [ativados, setAtivados] = useState<Record<string, string>>({});

  async function carregar() {
    setCarregando(true);
    setErroGeral(null);
    try {
      const res = await fetch('/api/anuncios/pendentes');
      const json = await res.json();
      if (!res.ok) {
        setErroGeral(json?.erro ?? 'Falha ao listar pendentes.');
        return;
      }
      setContas(json.contas ?? []);
    } catch (e) {
      setErroGeral(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function ativar(id: string) {
    if (!window.confirm(`Ativar o anúncio ${id}? Ele fica visível pra compra no Mercado Livre.`)) return;
    setAtivando(id);
    try {
      const res = await fetch(`/api/anuncios/pendentes/${id}/ativar`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        window.alert(`Não consegui ativar: ${json?.erro ?? 'falha desconhecida'}`);
        return;
      }
      setAtivados((prev) => ({ ...prev, [id]: json.status ?? 'active' }));
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    } finally {
      setAtivando(null);
    }
  }

  const total = contas?.reduce((acc, c) => acc + c.itens.length, 0) ?? 0;

  return (
    <Secao
      titulo="Pendentes"
      acao={
        <button type="button" className="btn pequeno" onClick={carregar} disabled={carregando}>
          {carregando ? 'Atualizando…' : 'Atualizar'}
        </button>
      }
    >
      <small>
        Todos os anúncios <strong>pausados</strong> das contas cadastradas — criados aqui ou
        pausados por qualquer outro motivo. Ative só depois de conferir; o app nunca ativa
        sozinho.
      </small>

      {erroGeral ? (
        <p style={{ margin: '12px 0 0' }}>
          <Selo nivel="critico">falhou</Selo> {erroGeral}
        </p>
      ) : null}

      {carregando && !contas ? <p style={{ margin: '12px 0 0' }}>Carregando…</p> : null}

      {contas && !carregando ? (
        <p style={{ margin: '12px 0' }}>
          <Selo semIcone>{total} pendente{total === 1 ? '' : 's'}</Selo>
        </p>
      ) : null}

      {contas?.map((c) => (
        <div key={c.seller_id} className="card" style={{ marginTop: 12 }}>
          <p style={{ margin: 0 }}>
            <strong>{c.apelido ?? c.seller_id}</strong>{' '}
            <Selo semIcone mono>
              {c.seller_id}
            </Selo>
          </p>
          {c.erro ? (
            <p style={{ margin: '8px 0 0' }}>
              <Selo nivel="critico">falhou</Selo> {c.erro}
            </p>
          ) : c.itens.length === 0 ? (
            <p style={{ margin: '8px 0 0' }}>
              <Selo nivel="bom">nada pendente</Selo>
            </p>
          ) : (
            <table className="tabela" style={{ marginTop: 8 }}>
              <tbody>
                {c.itens.map((it) => {
                  const statusAtual = ativados[it.id] ?? it.status;
                  return (
                    <tr key={it.id}>
                      <td>
                        <a href={`/itens/${it.id}`}>{it.titulo ?? it.id}</a>
                        <br />
                        <small>{it.id}</small>
                      </td>
                      <td>
                        <Selo nivel={statusAtual === 'active' ? 'bom' : 'atencao'} semIcone>
                          {statusAtual ?? '—'}
                        </Selo>
                      </td>
                      <td>
                        {it.permalink ? (
                          <a href={it.permalink} target="_blank" rel="noreferrer">
                            ver no ML
                          </a>
                        ) : null}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn primary pequeno"
                          onClick={() => ativar(it.id)}
                          disabled={ativando === it.id || statusAtual === 'active'}
                        >
                          {ativando === it.id ? 'Ativando…' : statusAtual === 'active' ? 'ativo' : 'Ativar'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </Secao>
  );
}
