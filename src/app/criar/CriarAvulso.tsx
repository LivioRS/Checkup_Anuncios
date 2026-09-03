'use client';

import { useState } from 'react';
import { Selo, Secao } from '@/components/ui';

type Conta = { id: number; seller_id: string; apelido: string | null; org: string | null };

type Sugestao = { category_id?: string; category_name?: string | null; domain_name?: string | null };

/** Lê o motivo real de uma resposta de erro das rotas — o detalhe do ML vem em `body`. */
function descreverErro(json: unknown): string {
  try {
    const j = json as { erro?: string; body?: { message?: string; cause?: { message?: string }[] } };
    const causa = j?.body?.cause?.map((c) => c?.message).filter(Boolean).join('; ');
    return [j?.erro, j?.body?.message, causa].filter(Boolean).join(' — ') || 'Falhou sem explicar.';
  } catch {
    return 'Não consegui ler a resposta.';
  }
}

const campo = { marginTop: 12 } as const;

export default function CriarAvulso({ contas }: { contas: Conta[] }) {
  const [sellerId, setSellerId] = useState(contas[0]?.seller_id ?? '');
  const [titulo, setTitulo] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [valor, setValor] = useState('');
  const [quantidade, setQuantidade] = useState('1');
  const [condicao, setCondicao] = useState<'new' | 'used'>('new');
  const [marca, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [gtin, setGtin] = useState('');
  const [garantiaTipo, setGarantiaTipo] = useState<'vendedor' | 'fabrica' | 'nenhuma'>('vendedor');
  const [garantiaTempo, setGarantiaTempo] = useState('90 dias');
  const [fotosTexto, setFotosTexto] = useState('');
  const [listingType, setListingType] = useState<'gold_special' | 'gold_pro'>('gold_special');
  const [descricao, setDescricao] = useState('');

  const [sugerindo, setSugerindo] = useState(false);
  const [sugestoes, setSugestoes] = useState<Sugestao[] | null>(null);
  const [criando, setCriando] = useState(false);
  const [resultado, setResultado] = useState<
    | { ok: true; id?: string; permalink?: string; erroDescricao?: unknown }
    | { ok: false; msg: string }
    | null
  >(null);

  const fotos = fotosTexto
    .split(/\s*\n\s*/)
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\/\S+$/i.test(s));

  const podeCriar =
    !!sellerId &&
    titulo.trim().length >= 10 &&
    titulo.trim().length <= 60 &&
    /^ML[A-Z]\d+$/.test(categoryId.trim()) &&
    Number(valor.replace(',', '.')) > 0 &&
    Number.isInteger(Number(quantidade)) &&
    Number(quantidade) >= 1 &&
    !!marca.trim() &&
    !!modelo.trim() &&
    fotos.length >= 1;

  async function sugerirCategoria() {
    if (titulo.trim().length < 3) return;
    setSugerindo(true);
    setSugestoes(null);
    try {
      const p = new URLSearchParams({ q: titulo.trim(), seller_id: sellerId });
      const res = await fetch(`/api/anuncios/categoria?${p}`);
      const json = await res.json();
      if (!res.ok) {
        setSugestoes([]);
        return;
      }
      setSugestoes(json.sugestoes ?? []);
      if (json.sugestoes?.[0]?.category_id) setCategoryId(json.sugestoes[0].category_id);
    } catch {
      setSugestoes([]);
    } finally {
      setSugerindo(false);
    }
  }

  async function criar() {
    setCriando(true);
    setResultado(null);
    try {
      const res = await fetch('/api/anuncios/avulso', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          seller_id: sellerId,
          titulo: titulo.trim(),
          category_id: categoryId.trim(),
          valor: Number(valor.replace(',', '.')),
          quantidade: Number(quantidade),
          condicao,
          marca: marca.trim(),
          modelo: modelo.trim(),
          gtin: gtin.trim(),
          garantia: { tipo: garantiaTipo, tempo: garantiaTempo.trim() },
          fotos,
          listing_type_id: listingType,
          descricao: descricao.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        setResultado({ ok: false, msg: descreverErro(json) });
        return;
      }
      setResultado({
        ok: true,
        id: json?.criado?.id,
        permalink: json?.criado?.permalink,
        erroDescricao: json?.erroDescricao,
      });
    } catch (e) {
      setResultado({ ok: false, msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setCriando(false);
    }
  }

  return (
    <>
      <Secao titulo="1. Produto">
        <div className="campo pilha">
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

        <div className="campo pilha" style={campo}>
          <div className="rot">Título ({titulo.trim().length}/60)</div>
          <div className="ctrl">
            <input
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Produto + Marca + Modelo + o que diferencia"
              maxLength={60}
            />
          </div>
        </div>

        <div className="campo pilha" style={campo}>
          <div className="rot">Categoria</div>
          <div className="ctrl" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              type="text"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value.toUpperCase())}
              placeholder="MLB1234"
              style={{ maxWidth: 160 }}
            />
            <button
              type="button"
              className="btn pequeno"
              onClick={sugerirCategoria}
              disabled={sugerindo || titulo.trim().length < 3}
            >
              {sugerindo ? 'Buscando…' : 'Sugerir pelo título'}
            </button>
          </div>
        </div>
        {sugestoes && sugestoes.length > 0 ? (
          <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {sugestoes.map((s) => (
              <button
                key={s.category_id}
                type="button"
                className="btn pequeno"
                onClick={() => s.category_id && setCategoryId(s.category_id)}
              >
                {s.category_id} · {s.category_name ?? s.domain_name ?? '—'}
              </button>
            ))}
          </div>
        ) : sugestoes && sugestoes.length === 0 ? (
          <small className="vazio">Nenhuma sugestão — informe a categoria manualmente.</small>
        ) : null}
      </Secao>

      <Secao titulo="2. Ficha">
        <div className="campo pilha">
          <div className="rot">Marca</div>
          <div className="ctrl">
            <input type="text" value={marca} onChange={(e) => setMarca(e.target.value)} />
          </div>
        </div>
        <div className="campo pilha" style={campo}>
          <div className="rot">Modelo</div>
          <div className="ctrl">
            <input type="text" value={modelo} onChange={(e) => setModelo(e.target.value)} />
          </div>
        </div>
        <div className="campo pilha" style={campo}>
          <div className="rot">GTIN / EAN (deixe vazio se não tiver)</div>
          <div className="ctrl">
            <input
              type="text"
              value={gtin}
              onChange={(e) => setGtin(e.target.value)}
              placeholder="7891234567890"
            />
          </div>
        </div>
        <div className="campo pilha" style={campo}>
          <div className="rot">Garantia</div>
          <div className="ctrl" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select
              value={garantiaTipo}
              onChange={(e) => setGarantiaTipo(e.target.value as typeof garantiaTipo)}
            >
              <option value="vendedor">Do vendedor</option>
              <option value="fabrica">De fábrica</option>
              <option value="nenhuma">Sem garantia</option>
            </select>
            {garantiaTipo !== 'nenhuma' ? (
              <input
                type="text"
                value={garantiaTempo}
                onChange={(e) => setGarantiaTempo(e.target.value)}
                placeholder="90 dias"
                style={{ maxWidth: 140 }}
              />
            ) : null}
          </div>
        </div>
      </Secao>

      <Secao titulo="3. Fotos (URLs, uma por linha)">
        <div className="ctrl">
          <textarea
            rows={4}
            value={fotosTexto}
            onChange={(e) => setFotosTexto(e.target.value)}
            placeholder={'https://http2.mlstatic.com/…/foto1.jpg\nhttps://…/foto2.jpg'}
            style={{ width: '100%', fontFamily: 'inherit', resize: 'vertical' }}
          />
        </div>
        <small>
          <Selo semIcone>{fotos.length} foto{fotos.length === 1 ? '' : 's'} válida{fotos.length === 1 ? '' : 's'}</Selo>{' '}
          A primeira vira a capa. Só URL de imagem já hospedada — upload de arquivo é outro passo.
        </small>
      </Secao>

      <Secao titulo="4. Preço, estoque, condição e tipo">
        <div className="campo pilha">
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
        <div className="campo pilha" style={campo}>
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
        <div className="campo pilha" style={campo}>
          <div className="rot">Condição</div>
          <div className="ctrl">
            <select value={condicao} onChange={(e) => setCondicao(e.target.value as 'new' | 'used')}>
              <option value="new">Novo</option>
              <option value="used">Usado</option>
            </select>
          </div>
        </div>
        <div className="campo pilha" style={campo}>
          <div className="rot">Tipo de anúncio</div>
          <div className="ctrl">
            <select
              value={listingType}
              onChange={(e) => setListingType(e.target.value as typeof listingType)}
            >
              <option value="gold_special">Clássico (grátis)</option>
              <option value="gold_pro">Premium</option>
            </select>
          </div>
        </div>
      </Secao>

      <Secao titulo="5. Descrição (opcional)">
        <div className="ctrl">
          <textarea
            rows={6}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Texto simples. Sem HTML, sem emoji. Dá pra melhorar depois na tela de Descrição."
            style={{ width: '100%', fontFamily: 'inherit', resize: 'vertical' }}
          />
        </div>
      </Secao>

      <p style={{ marginTop: 14 }}>
        <button className="btn primary" type="button" onClick={criar} disabled={criando || !podeCriar}>
          {criando ? 'Criando…' : 'Criar anúncio (fica pausado)'}
        </button>
      </p>
      <small>
        O anúncio nasce como rascunho pausado — nunca ativo sozinho. Se o Mercado Livre recusar
        por atributo obrigatório faltando (varia por categoria), o erro aparece aqui e você
        completa a ficha no próprio ML.
      </small>

      {resultado ? (
        <Secao titulo="Resultado">
          {resultado.ok ? (
            <>
              <p style={{ margin: 0 }}>
                <Selo nivel="bom">criado, pausado</Selo>{' '}
                {resultado.permalink ? (
                  <a href={resultado.permalink} target="_blank" rel="noreferrer">
                    {resultado.id}
                  </a>
                ) : (
                  resultado.id
                )}{' '}
                — confira e ative manualmente no Mercado Livre.
              </p>
              {resultado.erroDescricao ? (
                <p style={{ margin: '8px 0 0' }}>
                  <Selo nivel="atencao">a descrição não gravou</Selo> o anúncio foi criado; ajuste
                  a descrição pela tela de Descrição.
                </p>
              ) : null}
            </>
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
