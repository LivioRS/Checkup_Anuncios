'use client';

import { useState } from 'react';
import { Selo, type Nivel } from './ui';
import { explicarTag, oportunidades, dicionario, type PesoTag } from '@/lib/ml/tags';

const NIVEL: Record<PesoTag, Nivel> = { bom: 'bom', ruim: 'critico', neutro: 'neutro' };
const SETA: Record<PesoTag, string> = { bom: '▲', ruim: '▼', neutro: '–' };

function Linha({
  nome,
  tipo,
  presente,
}: {
  nome: string;
  tipo: 'anuncio' | 'vendedor';
  presente: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const info = explicarTag(nome, tipo);
  const peso: PesoTag = info?.peso ?? 'neutro';

  return (
    <div className={`tag-linha${presente ? ' tem' : ''}`}>
      <button
        className="tag-topo"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        disabled={!info}
        title={info ? 'Ver o que essa tag significa' : 'Tag ainda não mapeada no dicionário'}
      >
        <span className={`seta ${peso}`} aria-hidden="true">
          {SETA[peso]}
        </span>
        <code>{nome}</code>
        {presente ? (
          <Selo nivel={NIVEL[peso]}>
            {peso === 'bom' ? 'a favor' : peso === 'ruim' ? 'contra' : 'informativa'}
          </Selo>
        ) : (
          <Selo semIcone>não tem</Selo>
        )}
        {info ? (
          <span className="mais" aria-hidden="true">
            {aberto ? '−' : '+'}
          </span>
        ) : null}
      </button>
      {aberto && info ? <p className="tag-sig">{info.significado}</p> : null}
    </div>
  );
}

type Nova = {
  nome: string;
  tipo: 'anuncio' | 'vendedor';
  vezes: number;
  significado: string | null;
};

type Vista = 'presentes' | 'faltam' | 'dicionario' | 'novas';

export default function Tags({
  doAnuncio,
  doVendedor,
  novas = [],
}: {
  doAnuncio: string[];
  doVendedor: string[];
  /** Tags que o ML devolveu e o dicionário não explica, acumuladas no banco. */
  novas?: Nova[];
}) {
  const [vista, setVista] = useState<Vista>('presentes');

  const ordenar = (lista: string[], tipo: 'anuncio' | 'vendedor') =>
    [...lista].sort((a, b) => {
      const pa = explicarTag(a, tipo)?.peso ?? 'neutro';
      const pb = explicarTag(b, tipo)?.peso ?? 'neutro';
      const ordem = { ruim: 0, bom: 1, neutro: 2 } as const;
      return ordem[pa] - ordem[pb] || a.localeCompare(b);
    });

  const faltamAnuncio = oportunidades(doAnuncio, 'anuncio');
  const faltamVendedor = oportunidades(doVendedor, 'vendedor');
  const dicAnuncio = dicionario('anuncio');
  const dicVendedor = dicionario('vendedor');
  const temAnuncio = new Set(doAnuncio);
  const temVendedor = new Set(doVendedor);

  const contar = (lista: string[], tipo: 'anuncio' | 'vendedor', peso: PesoTag) =>
    lista.filter((t) => (explicarTag(t, tipo)?.peso ?? 'neutro') === peso).length;

  return (
    <>
      {vista === 'presentes' ? (
      <div className="grid k2" style={{ margin: 0 }}>
        <div>
          <h3>
            Tags do anúncio{' '}
            <small>
              {contar(doAnuncio, 'anuncio', 'bom')} a favor ·{' '}
              {contar(doAnuncio, 'anuncio', 'ruim')} contra
            </small>
          </h3>
          {doAnuncio.length ? (
            ordenar(doAnuncio, 'anuncio').map((t) => (
              <Linha key={t} nome={t} tipo="anuncio" presente />
            ))
          ) : (
            <p className="vazio">Este anúncio não tem nenhuma tag.</p>
          )}
        </div>

        <div>
          <h3>
            Tags do vendedor{' '}
            <small>
              {contar(doVendedor, 'vendedor', 'bom')} a favor ·{' '}
              {contar(doVendedor, 'vendedor', 'ruim')} contra
            </small>
          </h3>
          {doVendedor.length ? (
            ordenar(doVendedor, 'vendedor').map((t) => (
              <Linha key={t} nome={t} tipo="vendedor" presente />
            ))
          ) : (
            <p className="vazio">Nenhuma tag na conta.</p>
          )}
        </div>
      </div>
      ) : null}

      <div className="abas">
        {(
          [
            ['presentes', `No anúncio e na conta (${doAnuncio.length + doVendedor.length})`],
            ['faltam', `Boas que faltam (${faltamAnuncio.length + faltamVendedor.length})`],
            ['dicionario', `Dicionário (${dicAnuncio.length + dicVendedor.length})`],
            ['novas', `A estudar (${novas.length})`],
          ] as [Vista, string][]
        ).map(([v, rotulo]) => (
          <button
            key={v}
            className={`btn pequeno${vista === v ? ' primary' : ''}`}
            onClick={() => setVista(v)}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {vista === 'faltam' ? (
        <div className="grid k2" style={{ marginTop: 14, marginBottom: 0 }}>
          <div>
            <h3>Faltam no anúncio</h3>
            {faltamAnuncio.map((t) => (
              <Linha key={t} nome={t} tipo="anuncio" presente={false} />
            ))}
          </div>
          <div>
            <h3>Faltam na conta</h3>
            {faltamVendedor.map((t) => (
              <Linha key={t} nome={t} tipo="vendedor" presente={false} />
            ))}
          </div>
        </div>
      ) : null}

      {vista === 'dicionario' ? (
        <div style={{ marginTop: 14 }}>
          <p style={{ marginTop: 0 }}>
            <small>
              Todas as tags mapeadas, piores primeiro. Clique em qualquer uma para ler o que ela
              significa. As que este anúncio tem aparecem em destaque.
            </small>
          </p>
          <div className="grid k2" style={{ marginBottom: 0 }}>
            <div>
              <h3>Tags de anúncio ({dicAnuncio.length})</h3>
              {dicAnuncio.map((d) => (
                <Linha
                  key={d.nome}
                  nome={d.nome}
                  tipo="anuncio"
                  presente={temAnuncio.has(d.nome)}
                />
              ))}
            </div>
            <div>
              <h3>Tags de vendedor ({dicVendedor.length})</h3>
              {dicVendedor.map((d) => (
                <Linha
                  key={d.nome}
                  nome={d.nome}
                  tipo="vendedor"
                  presente={temVendedor.has(d.nome)}
                />
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {vista === 'novas' ? (
        <div style={{ marginTop: 14 }}>
          <p style={{ marginTop: 0 }}>
            <small>
              Tags que o Mercado Livre devolveu e o dicionário ainda não explica. O painel registra
              sozinho toda vez que encontra uma e conta quantas vezes já apareceu — quem aparece
              muito é quem vale estudar primeiro.
            </small>
          </p>
          {novas.length ? (
            <div className="rolagem">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Tag</th>
                    <th style={{ width: 110 }}>Onde</th>
                    <th style={{ width: 90 }}>Vezes</th>
                    <th>Significado</th>
                  </tr>
                </thead>
                <tbody>
                  {novas.map((n) => (
                    <tr key={`${n.tipo}:${n.nome}`}>
                      <td className="rotulo">
                        <code>{n.nome}</code>
                      </td>
                      <td>
                        <Selo semIcone>{n.tipo === 'anuncio' ? 'anúncio' : 'vendedor'}</Selo>
                      </td>
                      <td>
                        <Selo mono semIcone>
                          {n.vezes}
                        </Selo>
                      </td>
                      <td>
                        {n.significado ? (
                          <small>{n.significado}</small>
                        ) : (
                          <Selo nivel="atencao">a estudar</Selo>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="vazio">
              Nenhuma tag fora do dicionário até agora. Conforme você abrir mais anúncios, o que
              aparecer de novo cai aqui.
            </p>
          )}
        </div>
      ) : null}

      <style>{`
        .abas { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px; }
        .tag-linha { border-bottom: 1px solid var(--linha); }
        .tag-linha:last-child { border-bottom: 0; }
        .tag-topo {
          display: flex; align-items: center; gap: 8px;
          width: 100%; padding: 9px 4px; background: none; border: 0;
          color: var(--tinta); font: inherit; text-align: left; cursor: pointer;
        }
        .tag-topo:disabled { cursor: default; }
        .tag-topo:hover:not(:disabled) { background: var(--superficie-2); }
        .tag-topo code { background: none; padding: 0; font-size: 12.5px; color: var(--tinta-2); }
        .tag-linha.tem .tag-topo code { color: var(--tinta); font-weight: 550; }
        .seta { font-size: 11px; width: 14px; text-align: center; }
        .seta.bom { color: var(--bom); }
        .seta.ruim { color: var(--critico); }
        .seta.neutro { color: var(--tinta-3); }
        .mais { margin-left: auto; color: var(--tinta-3); font-size: 15px; }
        .tag-sig {
          margin: 0 0 10px; padding: 10px 12px;
          background: var(--superficie-2); border-radius: var(--r-sm);
          font-size: 13px; line-height: 1.55; color: var(--tinta-2);
        }
      `}</style>
    </>
  );
}
