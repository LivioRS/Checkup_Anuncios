'use client';

import { useState } from 'react';
import { Selo, Secao } from '@/components/ui';

type Conta = { id: number; seller_id: string; apelido: string | null; org: string | null };

type Candidato = {
  id?: string;
  nome?: string;
  status?: string;
  domainId?: string;
  imagem?: string | null;
  atributos: { id?: string; name?: string; value_name?: string | null }[];
  situacao: { ok: boolean; motivo: string | null; ehPai: boolean };
};

/** Lê o motivo real de uma resposta de erro das rotas — o detalhe do ML vem em `body`. */
function descreverErro(json: unknown): string {
  try {
    const j = json as { erro?: string; body?: { message?: string; cause?: unknown } };
    const partes = [j?.erro, j?.body?.message].filter(Boolean) as string[];
    return partes.join(' — ') || 'Falhou e não explicou o motivo.';
  } catch {
    return 'Não consegui ler a resposta.';
  }
}

export default function CriarAnuncio({
  contas,
  prefill,
  base = '/api/anuncios',
  baseCatalogo = '/api/catalogo',
}: {
  contas: Conta[];
  prefill?: { sellerId?: string; marca?: string; modelo?: string; codigo?: string };
  /** Prefixo das rotas de criação. Admin: `/api/anuncios` (padrão). Portal: `/api/portal/anuncios`. */
  base?: string;
  /** Prefixo da busca de catálogo. Admin: `/api/catalogo` (padrão). Portal: `/api/portal/anuncios/catalogo`. */
  baseCatalogo?: string;
}) {
  const [sellerId, setSellerId] = useState(prefill?.sellerId || contas[0]?.seller_id || '');
  const [marca, setMarca] = useState(prefill?.marca ?? '');
  const [modelo, setModelo] = useState(prefill?.modelo ?? '');
  const [codigo, setCodigo] = useState(prefill?.codigo ?? '');

  const [buscando, setBuscando] = useState(false);
  const [erroBusca, setErroBusca] = useState<string | null>(null);
  const [candidatos, setCandidatos] = useState<Candidato[] | null>(null);

  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [valor, setValor] = useState('');
  const [quantidade, setQuantidade] = useState('1');
  const [condicao, setCondicao] = useState<'new' | 'used'>('new');

  const [criando, setCriando] = useState(false);
  const [resultado, setResultado] = useState<
    { ok: true; id?: string; permalink?: string } | { ok: false; msg: string } | null
  >(null);

  async function buscar() {
    setBuscando(true);
    setErroBusca(null);
    setCandidatos(null);
    setSelecionado(null);
    setResultado(null);
    try {
      const p = new URLSearchParams({ seller_id: sellerId, marca, modelo });
      if (codigo.trim()) p.set('codigo', codigo.trim());
      const res = await fetch(`${baseCatalogo}/buscar?${p.toString()}`);
      const json = await res.json();
      if (!res.ok) {
        setErroBusca(descreverErro(json));
        return;
      }
      setCandidatos(json.candidatos ?? []);
    } catch (e) {
      setErroBusca(e instanceof Error ? e.message : String(e));
    } finally {
      setBuscando(false);
    }
  }

  async function criar() {
    if (!selecionado) return;
    setCriando(true);
    setResultado(null);
    try {
      const res = await fetch(base, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          seller_id: sellerId,
          catalog_product_id: selecionado,
          valor: Number(valor.replace(',', '.')),
          quantidade: Number(quantidade),
          condicao,
          marca,
          modelo,
          codigo,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setResultado({ ok: false, msg: descreverErro(json) });
        return;
      }
      setResultado({ ok: true, id: json?.criado?.id, permalink: json?.criado?.permalink });
    } catch (e) {
      setResultado({ ok: false, msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setCriando(false);
    }
  }

  const candidatoEscolhido = candidatos?.find((c) => c.id === selecionado) ?? null;
  const podeConfirmar =
    !!selecionado &&
    !!candidatoEscolhido?.situacao.ok &&
    Number(valor.replace(',', '.')) > 0 &&
    Number.isInteger(Number(quantidade)) &&
    Number(quantidade) >= 1;

  return (
    <>
      <Secao titulo="1. Produto">
        <div className="grid k2">
          <div className="campo">
            <div className="rot">Conta</div>
            <div className="ctrl">
              <select value={sellerId} onChange={(e) => setSellerId(e.target.value)}>
                {contas.map((c) => (
                  <option key={c.id} value={c.seller_id}>
                    {c.apelido ?? c.seller_id}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="campo">
            <div className="rot">Código (GTIN/EAN) — opcional</div>
            <div className="ctrl">
              <input
                type="text"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="7891234567890"
              />
            </div>
          </div>
          <div className="campo">
            <div className="rot">Marca</div>
            <div className="ctrl">
              <input type="text" value={marca} onChange={(e) => setMarca(e.target.value)} />
            </div>
          </div>
          <div className="campo">
            <div className="rot">Modelo</div>
            <div className="ctrl">
              <input type="text" value={modelo} onChange={(e) => setModelo(e.target.value)} />
            </div>
          </div>
        </div>
        <p style={{ marginTop: 14 }}>
          <button
            className="btn primary"
            type="button"
            onClick={buscar}
            disabled={buscando || (!marca.trim() && !modelo.trim())}
          >
            {buscando ? 'Buscando…' : 'Buscar no catálogo'}
          </button>
        </p>
        {erroBusca ? (
          <p style={{ margin: 0 }}>
            <Selo nivel="critico">falhou</Selo> {erroBusca}
          </p>
        ) : null}
      </Secao>

      {candidatos && candidatos.length === 0 ? (
        <Secao titulo="Nada encontrado no catálogo">
          <p style={{ margin: 0 }}>
            Não achamos <strong>{[marca, modelo].filter(Boolean).join(' ')}</strong> no catálogo do
            Mercado Livre — fora do escopo deste fluxo por enquanto. Publique esse anúncio pelo
            caminho manual de sempre.
          </p>
        </Secao>
      ) : null}

      {candidatos && candidatos.length > 0 ? (
        <Secao titulo={`2. Escolha o produto (${candidatos.length})`}>
          <div className="rolagem">
            <table className="tabela">
              <tbody>
                {candidatos.map((c) => (
                  <tr
                    key={c.id}
                    className={selecionado === c.id ? 'usado' : ''}
                    style={{ cursor: c.situacao.ok ? 'pointer' : 'default', opacity: c.situacao.ok ? 1 : 0.6 }}
                    onClick={() => c.situacao.ok && c.id && setSelecionado(c.id)}
                  >
                    <td style={{ width: 56 }}>
                      {c.imagem ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.imagem} alt="" width={44} height={44} style={{ objectFit: 'contain' }} />
                      ) : null}
                    </td>
                    <td>
                      <div style={{ fontWeight: 550 }}>{c.nome ?? c.id}</div>
                      <div style={{ marginTop: 4, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        <Selo mono semIcone>
                          {c.id}
                        </Selo>
                        {c.situacao.ok ? (
                          <Selo nivel="bom">pronto p/ vincular</Selo>
                        ) : (
                          <Selo nivel="atencao">{c.situacao.motivo}</Selo>
                        )}
                        {c.atributos.slice(0, 3).map((a) => (
                          <Selo key={a.id} semIcone>
                            {a.name}: {a.value_name}
                          </Selo>
                        ))}
                      </div>
                    </td>
                    <td style={{ width: 90, textAlign: 'right' }}>
                      <input
                        type="radio"
                        checked={selecionado === c.id}
                        disabled={!c.situacao.ok}
                        onChange={() => c.id && setSelecionado(c.id)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Secao>
      ) : null}

      {selecionado ? (
        <Secao titulo="3. Preço, estoque e condição">
          <div className="grid k4">
            <div className="campo">
              <div className="rot">Valor (R$)</div>
              <div className="ctrl">
                <input
                  type="text"
                  inputMode="decimal"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  placeholder="199,90"
                />
              </div>
            </div>
            <div className="campo">
              <div className="rot">Quantidade</div>
              <div className="ctrl">
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={quantidade}
                  onChange={(e) => setQuantidade(e.target.value)}
                />
              </div>
            </div>
            <div className="campo">
              <div className="rot">Condição</div>
              <div className="ctrl">
                <select value={condicao} onChange={(e) => setCondicao(e.target.value as 'new' | 'used')}>
                  <option value="new">Novo</option>
                  <option value="used">Usado</option>
                </select>
              </div>
            </div>
          </div>
          <p style={{ marginTop: 14 }}>
            <button className="btn primary" type="button" onClick={criar} disabled={criando || !podeConfirmar}>
              {criando ? 'Criando…' : 'Criar anúncio (fica pausado)'}
            </button>
          </p>
          <small>
            O anúncio nasce como rascunho pausado — nunca ativo sozinho. Alguém confere e ativa
            manualmente no Mercado Livre.
          </small>
        </Secao>
      ) : null}

      {resultado ? (
        <Secao titulo="Resultado">
          {resultado.ok ? (
            <p style={{ margin: 0 }}>
              <Selo nivel="bom">criado, pausado</Selo>{' '}
              {resultado.permalink ? (
                <a href={resultado.permalink} target="_blank" rel="noreferrer">
                  {resultado.id}
                </a>
              ) : (
                resultado.id
              )}{' '}
              — confira e ative manualmente no Mercado Livre quando estiver pronto.
            </p>
          ) : (
            <p style={{ margin: 0 }}>
              <Selo nivel="critico">falhou</Selo> {resultado.msg}
            </p>
          )}
        </Secao>
      ) : null}
    </>
  );
}
