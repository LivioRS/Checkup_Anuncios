'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Selo, Secao, Medidor } from '@/components/ui';
import type { LoteComContagens, LoteItem, StatusLoteItem } from '@/lib/lotes/fila';

const INTERVALO_MS = 900;

const NIVEL_POR_STATUS: Record<StatusLoteItem, 'bom' | 'atencao' | 'critico' | undefined> = {
  pendente: undefined,
  processando: 'atencao',
  concluido: 'bom',
  erro: 'critico',
};

function descreverErro(json: unknown): string {
  try {
    const j = json as { erro?: string; body?: { message?: string } };
    return [j?.erro, j?.body?.message].filter(Boolean).join(' — ') || 'Falhou sem explicar.';
  } catch {
    return 'Não consegui ler a resposta.';
  }
}

function ResultadoDoItem({ tipo, item }: { tipo: string; item: LoteItem }) {
  if (item.status === 'erro') {
    return (
      <div>
        <Selo nivel="critico">erro</Selo>
        <pre className="texto">{item.erro ?? '(sem detalhe)'}</pre>
      </div>
    );
  }
  if (item.status !== 'concluido' || item.resultado == null) {
    return <small className="vazio">ainda sem resultado</small>;
  }

  if (tipo === 'titulo') {
    const r = item.resultado as {
      plano?: { titulos?: { texto?: string }[]; modelo?: { base?: string } | null };
    };
    return (
      <div>
        <ul style={{ margin: '4px 0', paddingLeft: 18 }}>
          {(r.plano?.titulos ?? []).map((t, i) => (
            <li key={i}>{t.texto}</li>
          ))}
        </ul>
        {r.plano?.modelo?.base ? (
          <small>
            MODEL sugerido: <strong>{r.plano.modelo.base}</strong>
          </small>
        ) : null}
      </div>
    );
  }

  if (tipo === 'descricao') {
    const r = item.resultado as { sugestao?: string };
    return <pre className="texto">{r.sugestao ?? JSON.stringify(item.resultado, null, 2)}</pre>;
  }

  return <pre className="texto">{JSON.stringify(item.resultado, null, 2)}</pre>;
}

export default function AcompanharLote({
  loteId,
  loteInicial,
  itensIniciais,
  base = '/api/lote',
  rotaIndice = '/lote',
  ferramentasInternas = true,
}: {
  loteId: string;
  loteInicial: LoteComContagens;
  itensIniciais: LoteItem[];
  /** Prefixo das rotas de lote. Admin: `/api/lote` (padrão). Portal: `/api/portal/lote`. */
  base?: string;
  /** Prefixo da página "Novo lote". Admin: `/lote` (padrão). Portal: `/portal/lote`. */
  rotaIndice?: string;
  /** Liga o link do item pra `/itens/{id}` (tela só-admin). O portal passa `false`. */
  ferramentasInternas?: boolean;
}) {
  const [lote, setLote] = useState(loteInicial);
  const [itens, setItens] = useState(itensIniciais);
  const [rodando, setRodando] = useState(loteInicial.status !== 'concluido');
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!rodando) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelado = false;

    async function recarregarItens() {
      const r = await fetch(`${base}/${loteId}/itens`);
      const j = await r.json();
      if (!cancelado && r.ok) setItens(j.itens ?? []);
    }

    async function tick() {
      if (cancelado) return;
      try {
        const res = await fetch(`${base}/${loteId}/processar`, { method: 'POST' });
        const novo = await res.json();
        if (cancelado) return;
        if (!res.ok) {
          setErro(descreverErro(novo));
          setRodando(false);
          return;
        }
        setLote(novo as LoteComContagens);
        await recarregarItens();
        if (cancelado) return;
        if ((novo as LoteComContagens).status === 'concluido') {
          setRodando(false);
          return;
        }
        timer = setTimeout(tick, INTERVALO_MS);
      } catch (e) {
        if (cancelado) return;
        setErro(e instanceof Error ? e.message : String(e));
        setRodando(false);
      }
    }

    tick();
    return () => {
      cancelado = true;
      if (timer) clearTimeout(timer);
    };
  }, [rodando, loteId, base]);

  async function reenfileirar() {
    setErro(null);
    try {
      const res = await fetch(`${base}/${loteId}/reenfileirar`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        setErro(descreverErro(json));
        return;
      }
      if (json.lote) setLote(json.lote as LoteComContagens);
      const ri = await fetch(`${base}/${loteId}/itens`);
      const ji = await ri.json();
      if (ri.ok) setItens(ji.itens ?? []);
      setRodando(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  const c = lote.contagens;
  const feitos = c.concluido + c.erro;
  const total = lote.total_itens;

  return (
    <>
      <Secao
        titulo="Progresso"
        acao={
          lote.status === 'concluido' ? (
            <Selo nivel="bom">concluído</Selo>
          ) : (
            <button className="btn pequeno" type="button" onClick={() => setRodando((v) => !v)}>
              {rodando ? 'Pausar' : 'Retomar'}
            </button>
          )
        }
      >
        <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          <Medidor rotulo="feitos" valor={feitos} max={total || 1} sufixo="" />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Selo>{c.pendente} pendente{c.pendente === 1 ? '' : 's'}</Selo>
            <Selo nivel="atencao">{c.processando} processando</Selo>
            <Selo nivel="bom">{c.concluido} concluído{c.concluido === 1 ? '' : 's'}</Selo>
            <Selo nivel="critico">{c.erro} com erro</Selo>
          </div>
        </div>
        <p style={{ margin: '10px 0 0' }}>
          <small>
            {feitos} de {total} processados
            {rodando ? ' — chamando o worker automaticamente…' : lote.status === 'concluido' ? '' : ' — pausado'}
          </small>
        </p>
        {erro ? (
          <p style={{ margin: '8px 0 0' }}>
            <Selo nivel="critico">falhou</Selo> {erro}
          </p>
        ) : null}
        {lote.status === 'concluido' && c.erro > 0 ? (
          <p style={{ marginTop: 12 }}>
            <button className="btn primary" type="button" onClick={reenfileirar}>
              Reenfileirar os {c.erro} que falharam
            </button>
          </p>
        ) : null}
      </Secao>

      <Secao titulo={`Itens (${itens.length})`} acao={<Link className="btn pequeno" href={rotaIndice}>Novo lote</Link>}>
        {itens.length === 0 ? (
          <p className="vazio" style={{ margin: 0 }}>
            Nenhum item.
          </p>
        ) : (
          <div className="rolagem">
            <table className="tabela">
              <tbody>
                {itens.map((it) => (
                  <tr key={it.id}>
                    <td style={{ verticalAlign: 'top', width: 160 }}>
                      {ferramentasInternas ? (
                        <Link href={`/itens/${it.item_id}`} style={{ fontWeight: 550 }}>
                          {it.item_id}
                        </Link>
                      ) : (
                        <span style={{ fontWeight: 550 }}>{it.item_id}</span>
                      )}
                      <div style={{ marginTop: 4 }}>
                        <Selo nivel={NIVEL_POR_STATUS[it.status]} semIcone>
                          {it.status}
                        </Selo>
                      </div>
                    </td>
                    <td>
                      <details>
                        <summary style={{ cursor: 'pointer' }}>
                          <small>ver resultado</small>
                        </summary>
                        <div style={{ marginTop: 6 }}>
                          <ResultadoDoItem tipo={lote.tipo} item={it} />
                        </div>
                      </details>
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
