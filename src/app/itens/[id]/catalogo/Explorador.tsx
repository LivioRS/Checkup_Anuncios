'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Selo, Secao } from '@/components/ui';
import type { LinhaComparacao, ProdutoCatalogo, ResultadoBusca } from '@/lib/ml/catalogo-tipos';

type Situacao = { ok: boolean; motivo: string | null; ehPai: boolean };

const brl = (v?: number, moeda?: string) =>
  typeof v === 'number'
    ? v.toLocaleString('pt-BR', { style: 'currency', currency: moeda ?? 'BRL' })
    : '—';

/** Abre o motivo real da recusa: o ML manda o detalhe em `cause`. */
function motivo(json: unknown): string {
  try {
    const j = json as { erro?: string; body?: Record<string, unknown> };
    const texto = (v: unknown): string => {
      if (v === null || v === undefined) return '';
      if (typeof v === 'string') return v.trim();
      if (typeof v === 'number' || typeof v === 'boolean') return String(v);
      if (Array.isArray(v)) return v.map(texto).filter(Boolean).join(' · ');
      const o = v as Record<string, unknown>;
      return ['code', 'message', 'cause'].map((k) => texto(o[k])).filter(Boolean).join(' · ');
    };
    const partes = [j?.erro, texto(j?.body?.message), texto(j?.body?.cause)].filter(
      Boolean,
    ) as string[];
    return [...new Set(partes)].join(' — ').slice(0, 500) || 'O ML recusou e não explicou.';
  } catch {
    return 'Não consegui ler a resposta.';
  }
}

/**
 * Link para a página do produto no site.
 *
 * O `permalink` vem vazio em produto inativo — e é justamente nesses que dá
 * vontade de conferir no site. Quando ele falta, montamos pelo id: o endereço
 * /p/{id} é estável e o ML redireciona para o slug bonito sozinho.
 */
function linkDoProduto(p: { id?: string; permalink?: string }): string | null {
  if (p.permalink?.trim()) return p.permalink;
  return p.id ? `https://www.mercadolivre.com.br/p/${p.id}` : null;
}

const NIVEL_SITUACAO = {
  diferente: 'critico',
  falta: 'atencao',
  igual: 'bom',
  extra: 'neutro',
} as const;

const ROTULO_SITUACAO = {
  diferente: 'diverge',
  falta: 'falta no anúncio',
  igual: 'confere',
  extra: 'só no anúncio',
} as const;

export default function Explorador({
  itemId,
  variacoes = [],
}: {
  itemId: string;
  /** Ids das variações do anúncio: o ML exige uma vinculação por variação. */
  variacoes?: { id: number; rotulo: string }[];
}) {
  const [codigo, setCodigo] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [candidatos, setCandidatos] = useState<ResultadoBusca[] | null>(null);
  const [via, setVia] = useState<string | null>(null);
  const [gtin, setGtin] = useState<string | null>(null);
  const [vinculos, setVinculos] = useState<
    {
      id: string;
      status?: string;
      permalink?: string;
      catalog_listing?: boolean;
      catalog_product_id?: string | null;
      price?: number;
      sold_quantity?: number;
      sincronia: string;
    }[]
  >([]);

  const [produto, setProduto] = useState<ProdutoCatalogo | null>(null);
  const [comparacao, setComparacao] = useState<LinhaComparacao[]>([]);
  const [situacao, setSituacao] = useState<Situacao | null>(null);

  const [vinculando, setVinculando] = useState(false);
  const [variacao, setVariacao] = useState<string>('');
  const [confirmar, setConfirmar] = useState(false);
  const [resultado, setResultado] = useState<
    { ok: true; id?: string; permalink?: string } | { ok: false; msg: string } | null
  >(null);

  async function vincular() {
    setVinculando(true);
    setResultado(null);
    try {
      const res = await fetch(`/api/catalogo/${itemId}/vincular`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          catalog_product_id: produto?.id,
          variation_id: variacao || undefined,
          aceitoDivergencias: confirmar,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json?.precisaConfirmar) setConfirmar(false);
        setResultado({ ok: false, msg: motivo(json) });
      } else {
        setResultado({ ok: true, id: json?.criado?.id, permalink: json?.criado?.permalink });
      }
    } catch (e) {
      setResultado({ ok: false, msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setVinculando(false);
    }
  }

  async function buscar(produtoId?: string) {
    setCarregando(true);
    setErro(null);
    try {
      const q = produtoId ? `?produto=${encodeURIComponent(produtoId)}` : '';
      const res = await fetch(`/api/catalogo/${itemId}${q}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.erro ?? 'Falhou.');

      if (json.produto) {
        setProduto(json.produto);
        setComparacao(json.comparacao ?? []);
        setSituacao(json.situacao ?? null);
      } else {
        setCandidatos(json.candidatos ?? []);
        setVia(json.via ?? null);
        setGtin(json.gtin ?? null);
        setVinculos(json.vinculos ?? []);
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(false);
    }
  }

  // Candidatos carregam sozinhos; o produto específico só quando você pede.
  useEffect(() => {
    buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  const contar = (s: LinhaComparacao['situacao']) =>
    comparacao.filter((l) => l.situacao === s).length;

  return (
    <>
      {/* ---------- o vínculo que já existe ---------- */}
      {vinculos.length ? (
        <Secao
          titulo="Anúncios de catálogo criados a partir deste"
          resumo={<Selo nivel="bom">{vinculos.length} vinculado(s)</Selo>}
        >
          <p style={{ marginTop: 0 }}>
            <small>
              Este é o comprovante do vínculo, e vem do campo <code>item_relations</code> do seu
              anúncio. O anúncio original NÃO muda de cara depois do opt-in: ele continua sendo de
              marketplace, e o Mercado Livre continua exibindo nele o convite para competir no
              catálogo. O convite é sobre ele mesmo, não sobre o anúncio novo.
            </small>
          </p>
          <div className="rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Anúncio de catálogo</th>
                  <th>Produto</th>
                  <th>Preço</th>
                  <th>Vendas</th>
                  <th>Sincronia</th>
                </tr>
              </thead>
              <tbody>
                {vinculos.map((v) => (
                  <tr key={v.id}>
                    <td className="rotulo">
                      <Selo mono semIcone>{v.id}</Selo>{' '}
                      <Selo nivel={v.status === 'active' ? 'bom' : 'atencao'}>{v.status}</Selo>
                      {v.permalink ? (
                        <>
                          {' '}
                          <a href={v.permalink} target="_blank" rel="noreferrer">
                            ver ↗
                          </a>
                        </>
                      ) : null}
                    </td>
                    <td>
                      {v.catalog_product_id ? (
                        <a
                          href={`https://www.mercadolivre.com.br/p/${v.catalog_product_id}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {v.catalog_product_id} ↗
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{brl(v.price)}</td>
                    <td>{v.sold_quantity ?? 0}</td>
                    <td>
                      {v.sincronia === 'SYNC' ? (
                        <Selo nivel="bom">sincronizado</Selo>
                      ) : v.sincronia === 'UNSYNC' ? (
                        <Selo nivel="critico">fora de sincronia</Selo>
                      ) : (
                        <Selo semIcone>—</Selo>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ marginBottom: 0 }}>
            <small>
              &quot;Fora de sincronia&quot; quer dizer que preço, frete ou estoque pararam de
              espelhar entre os dois anúncios, mesmo com o vínculo de pé. O ML documenta que isso
              acontece; me avise se aparecer, que eu ligo o botão de reconectar.
            </small>
          </p>
        </Secao>
      ) : null}

      <Secao titulo="Abrir um produto de catálogo">
        <p style={{ marginTop: 0 }}>
          <small>
            Achou no Mercado Livre a página de produto onde você quer entrar? Cole aqui o código ou
            o link inteiro — é o <code>/p/MLB…</code> do endereço. Serve para escolher pela página
            que já tem movimento, em vez de aceitar a primeira sugestão.
          </small>
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="MLB68596807 ou o link /p/…"
            value={codigo}
            style={{ flex: '1 1 320px' }}
            onChange={(e) => setCodigo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && codigo.trim()) buscar(codigo.trim());
            }}
          />
          <button
            className="btn primary"
            disabled={!codigo.trim() || carregando}
            onClick={() => buscar(codigo.trim())}
          >
            {carregando ? 'Buscando…' : 'Abrir produto'}
          </button>
          {produto ? (
            <button
              className="btn"
              disabled={carregando}
              onClick={() => {
                setProduto(null);
                setComparacao([]);
                setSituacao(null);
                setCodigo('');
              }}
            >
              Voltar aos sugeridos
            </button>
          ) : null}
        </div>
        {erro ? (
          <p style={{ margin: '10px 0 0' }}>
            <Selo nivel="critico">{erro}</Selo>
          </p>
        ) : null}
      </Secao>

      {produto ? (
        <>
          <Secao
            titulo={produto.name ?? produto.id ?? 'Produto'}
            resumo={
              situacao?.ok ? (
                <Selo nivel="bom">aceita vínculo</Selo>
              ) : (
                <Selo nivel="critico">não aceita</Selo>
              )
            }
            acao={
              linkDoProduto(produto) ? (
                <a
                  className="btn pequeno primary"
                  href={linkDoProduto(produto)!}
                  target="_blank"
                  rel="noreferrer"
                >
                  Ver no Mercado Livre ↗
                </a>
              ) : null
            }
          >
            <p
              style={{
                marginTop: 0,
                display: 'flex',
                gap: 6,
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              <Selo mono semIcone>
                {produto.id}
              </Selo>
              <Selo nivel={produto.status === 'active' ? 'bom' : 'critico'}>{produto.status}</Selo>
              {produto.domain_id ? <Selo semIcone>{produto.domain_id}</Selo> : null}
              {produto.settings?.listing_strategy ? (
                <Selo semIcone>{produto.settings.listing_strategy}</Selo>
              ) : null}
              {linkDoProduto(produto) ? (
                <a href={linkDoProduto(produto)!} target="_blank" rel="noreferrer">
                  abrir a página no ML ↗
                </a>
              ) : null}
            </p>

            {situacao && !situacao.ok ? (
              <p style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <Selo nivel="critico">bloqueado</Selo>
                <small>{situacao.motivo}</small>
              </p>
            ) : null}

            {situacao?.ehPai && produto.children_ids?.length ? (
              <div>
                <p style={{ margin: '0 0 8px' }}>
                  <small>Produtos específicos dentro dele — abra um destes:</small>
                </p>
                <p style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: 0 }}>
                  {produto.children_ids.slice(0, 30).map((f) => (
                    <span key={f} style={{ display: 'inline-flex', gap: 4 }}>
                      <button className="btn pequeno" onClick={() => buscar(f)}>
                        {f}
                      </button>
                      <a
                        className="btn pequeno"
                        href={`https://www.mercadolivre.com.br/p/${f}`}
                        target="_blank"
                        rel="noreferrer"
                        title="Ver no Mercado Livre"
                      >
                        ↗
                      </a>
                    </span>
                  ))}
                </p>
              </div>
            ) : null}

            {/* Quem está ganhando a disputa hoje — o mais perto de "vendas" que
                a API entrega para uma página de catálogo. */}
            <h3 style={{ marginTop: 18 }}>Quem está ganhando o buy box</h3>
            {produto.buy_box_winner ? (
              <div className="rolagem">
                <table className="tabela">
                  <tbody>
                    <tr>
                      <td className="rotulo">Anúncio vencedor</td>
                      <td>
                        <Selo mono semIcone>{produto.buy_box_winner.item_id}</Selo>{' '}
                        {produto.buy_box_winner.official_store_id ? (
                          <Selo nivel="atencao">loja oficial</Selo>
                        ) : null}
                      </td>
                    </tr>
                    <tr>
                      <td className="rotulo">Preço dele</td>
                      <td>
                        {brl(produto.buy_box_winner.price, produto.buy_box_winner.currency_id)}
                      </td>
                    </tr>
                    <tr>
                      <td className="rotulo">Faixa de preço na disputa</td>
                      <td>
                        {brl(
                          produto.buy_box_winner_price_range?.min?.price,
                          produto.buy_box_winner_price_range?.min?.currency_id,
                        )}{' '}
                        até{' '}
                        {brl(
                          produto.buy_box_winner_price_range?.max?.price,
                          produto.buy_box_winner_price_range?.max?.currency_id,
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td className="rotulo">Frete grátis</td>
                      <td>
                        {produto.buy_box_winner.shipping?.free_shipping ? (
                          <Selo nivel="bom">sim</Selo>
                        ) : (
                          <Selo semIcone>não</Selo>
                        )}{' '}
                        {produto.buy_box_winner.shipping?.logistic_type ? (
                          <Selo semIcone>{produto.buy_box_winner.shipping.logistic_type}</Selo>
                        ) : null}
                      </td>
                    </tr>
                    <tr>
                      <td className="rotulo">Reputação do vencedor</td>
                      <td>
                        <Selo semIcone>
                          {produto.buy_box_winner.seller?.reputation_level_id ?? '—'}
                        </Selo>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="vazio">
                O campo <code>buy_box_winner</code> veio vazio. Isso significa que{' '}
                <strong>nenhum anúncio de catálogo está ganhando o buy box agora</strong> — e NÃO
                que a página esteja parada. A página pode ter dezenas de ofertas vendendo como
                anúncio de marketplace comum, que é o mais frequente. Abra o link acima para ver.
              </p>
            )}

            <p style={{ marginBottom: 0 }}>
              <small>
                A API não informa quantidade de vendas nem quantos concorrentes existem numa página
                de catálogo — procurei na documentação e esse dado não é exposto. O que ela dá é o
                vencedor do buy box, quando existe, e a faixa de preço. Quem mostra número de
                ofertas, quantidade vendida por vendedor e reputação de cada um é a própria página
                no site.
              </small>
            </p>
          </Secao>

          <Secao
            titulo="Sua ficha x a ficha do catálogo"
            resumo={
              <>
                {contar('diferente') ? (
                  <Selo nivel="critico">{contar('diferente')} divergem</Selo>
                ) : (
                  <Selo nivel="bom">nada diverge</Selo>
                )}
                {contar('falta') ? <Selo nivel="atencao">{contar('falta')} faltam</Selo> : null}
              </>
            }
          >
            <p style={{ marginTop: 0 }}>
              <small>
                Confira linha por linha antes de decidir. O Mercado Livre diz que o vendedor é o
                responsável por o produto associado coincidir, e que divergência gera reclamação e
                cancelamento — o que derruba reputação e pode custar o direito de publicar em
                catálogo.
              </small>
            </p>
            {comparacao.length ? (
              <div className="rolagem">
                <table className="tabela">
                  <thead>
                    <tr>
                      <th>Atributo</th>
                      <th>No catálogo</th>
                      <th>No seu anúncio</th>
                      <th style={{ width: 130 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparacao.map((l) => (
                      <tr key={l.id}>
                        <td className="rotulo">
                          {l.nome}
                          <br />
                          <small>{l.id}</small>
                        </td>
                        <td>{l.doCatalogo ?? '—'}</td>
                        <td>{l.doAnuncio ?? '—'}</td>
                        <td>
                          <Selo nivel={NIVEL_SITUACAO[l.situacao]}>
                            {ROTULO_SITUACAO[l.situacao]}
                          </Selo>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="vazio">Este produto não expõe ficha para comparar.</p>
            )}
          </Secao>

          {/* ---------- a ação que muda o mundo ---------- */}
          <Secao titulo="Vincular este anúncio ao produto">
            {resultado?.ok ? (
              <p style={{ marginTop: 0 }}>
                <Selo nivel="bom">anúncio de catálogo criado</Selo>{' '}
                <Selo mono semIcone>{resultado.id}</Selo>{' '}
                {resultado.permalink ? (
                  <a href={resultado.permalink} target="_blank" rel="noreferrer">
                    abrir ↗
                  </a>
                ) : null}
                <br />
                <small>
                  Seu anúncio original continua ativo e independente. A partir de agora preço,
                  frete, estoque e garantia sincronizam entre os dois.
                </small>
              </p>
            ) : (
              <>
                <p style={{ marginTop: 0 }}>
                  <small>
                    Isto cria um anúncio NOVO de catálogo a partir deste. O seu continua existindo.
                    Preço, frete, estoque, garantia, SKU e tipo de anúncio passam a sincronizar
                    entre os dois, e o Mercado Livre não permite desligar essa sincronização.
                  </small>
                </p>

                {variacoes.length ? (
                  <div className="campo">
                    <div className="rot">
                      Variação
                      <div className="selos">
                        <Selo nivel="atencao">obrigatória</Selo>
                      </div>
                    </div>
                    <div className="ctrl" style={{ display: 'block' }}>
                      <select value={variacao} onChange={(e) => setVariacao(e.target.value)}>
                        <option value="">escolha a variação…</option>
                        {variacoes.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.rotulo}
                          </option>
                        ))}
                      </select>
                      <p style={{ margin: '8px 0 0' }}>
                        <small>
                          Seu anúncio tem variações, e produto de catálogo não aceita variação: é um
                          vínculo por variação, cada um com o seu produto. Faça um de cada vez.
                        </small>
                      </p>
                    </div>
                  </div>
                ) : null}

                {contar('diferente') ? (
                  <p style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <Selo nivel="critico">{contar('diferente')} divergem</Selo>
                    <label className="na">
                      <input
                        type="checkbox"
                        checked={confirmar}
                        onChange={(e) => setConfirmar(e.target.checked)}
                      />
                      Conferi as divergências acima e quero vincular assim
                    </label>
                  </p>
                ) : null}

                <div className="salvar" style={{ marginTop: 8 }}>
                  <button
                    className="btn primary"
                    disabled={
                      vinculando ||
                      !situacao?.ok ||
                      (!!variacoes.length && !variacao) ||
                      (!!contar('diferente') && !confirmar)
                    }
                    onClick={vincular}
                  >
                    {vinculando ? 'Enviando…' : 'Vincular ao catálogo'}
                  </button>
                  {resultado && !resultado.ok ? (
                    <span style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                      <Selo nivel="critico">recusado</Selo>
                      <small style={{ maxWidth: 620 }}>{resultado.msg}</small>
                    </span>
                  ) : (
                    <small>
                      {situacao?.ok
                        ? 'Não dá para desfazer por aqui: o anúncio criado se gerencia sozinho depois.'
                        : 'Este produto não aceita vínculo.'}
                    </small>
                  )}
                </div>
              </>
            )}
          </Secao>
        </>
      ) : (
        <Secao
          titulo="Produtos sugeridos para este anúncio"
          resumo={
            candidatos ? (
              <Selo semIcone>{candidatos.length} encontrados</Selo>
            ) : (
              <Selo semIcone>buscando…</Selo>
            )
          }
        >
          <p style={{ marginTop: 0 }}>
            <small>
              {via === 'gtin' ? (
                <>
                  Busca pelo GTIN <strong>{gtin}</strong> da sua ficha. É a forma mais confiável: o
                  ML devolve o produto exato, não uma lista de parecidos.
                </>
              ) : via === 'texto' ? (
                <>
                  Busca pelo título do anúncio
                  {gtin ? ' — o GTIN da ficha não achou produto' : ' — sua ficha não tem GTIN'}. Por
                  texto vêm parecidos, então confira a ficha de cada um antes de escolher.
                </>
              ) : (
                'Nada encontrado.'
              )}
            </small>
          </p>

          {candidatos?.length ? (
            <div className="rolagem">
              <table className="tabela">
                <tbody>
                  {candidatos.map((c) => (
                    <tr key={c.id}>
                      <td className="rotulo">
                        {c.name ?? c.id}
                        <div style={{ marginTop: 4, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          <Selo mono semIcone>
                            {c.id}
                          </Selo>
                          <Selo nivel={c.status === 'active' ? 'bom' : 'atencao'}>{c.status}</Selo>
                          {c.children_ids?.length ? (
                            <Selo nivel="atencao">pai · {c.children_ids.length} filhos</Selo>
                          ) : null}
                        </div>
                      </td>
                      <td style={{ width: 150, textAlign: 'right' }}>
                        <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          {linkDoProduto(c) ? (
                            <a
                              className="btn pequeno"
                              href={linkDoProduto(c)!}
                              target="_blank"
                              rel="noreferrer"
                              title="Ver a página no Mercado Livre"
                            >
                              ML ↗
                            </a>
                          ) : null}
                          <button className="btn pequeno" onClick={() => buscar(c.id)}>
                            Abrir
                          </button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="vazio">
              {carregando
                ? 'Procurando…'
                : 'Nenhum produto de catálogo sugerido. Se você viu um no site, cole o código acima.'}
            </p>
          )}
        </Secao>
      )}

      <p>
        <Link className="btn" href={`/itens/${itemId}`}>
          Voltar ao check-up
        </Link>
      </p>
    </>
  );
}
