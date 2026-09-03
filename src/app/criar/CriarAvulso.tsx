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

export default function CriarAvulso({
  contas,
  onTrocarParaCatalogo,
}: {
  contas: Conta[];
  onTrocarParaCatalogo?: (dados: { sellerId?: string; marca?: string; modelo?: string; codigo?: string }) => void;
}) {
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
  const [escolhaIa, setEscolhaIa] = useState<{ category_id: string; motivo: string } | null>(null);
  const [roteiroFotos, setRoteiroFotos] = useState<{ titulo: string; descricao: string }[] | null>(null);
  const [iaCarregando, setIaCarregando] = useState<'descricao' | 'roteiro-fotos' | 'ficha-da-foto' | null>(null);
  const [iaErro, setIaErro] = useState<string | null>(null);

  // Plano 032 — ficha por GTIN (determinístico) e ficha da foto (visão).
  const [buscandoFicha, setBuscandoFicha] = useState(false);
  const [fichaGtin, setFichaGtin] = useState<{ id: string; nome: string; valor: string }[] | null>(null);
  const [fichaGtinMarcados, setFichaGtinMarcados] = useState<Record<string, boolean>>({});
  const [fichaGtinMsg, setFichaGtinMsg] = useState<string | null>(null);
  const [fichaGtinProdutoId, setFichaGtinProdutoId] = useState<string | null>(null);
  const [tituloSugerido, setTituloSugerido] = useState<string | null>(null);
  const [fotoFichaUrl, setFotoFichaUrl] = useState('');
  const [fichaDaFoto, setFichaDaFoto] = useState<{ nome: string; valor: string }[] | null>(null);
  const [usouFoto, setUsouFoto] = useState(false);

  // Plano 033 — rascunho por IA e ficha do site da marca.
  const [preenchendoIa, setPreenchendoIa] = useState(false);
  const [fichaWeb, setFichaWeb] = useState<{ nome: string; valor: string }[] | null>(null);
  const [fichaWebFontes, setFichaWebFontes] = useState<string[]>([]);
  const [fichaWebMsg, setFichaWebMsg] = useState<string | null>(null);
  const [buscandoFichaWeb, setBuscandoFichaWeb] = useState(false);
  const [preenchidoPorIa, setPreenchidoPorIa] = useState(false);

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

  const categoriaNome =
    sugestoes?.find((s) => s.category_id === categoryId.trim())?.category_name ?? undefined;

  async function preencherComIa() {
    if (titulo.trim().length < 10) return;
    setPreenchendoIa(true);
    setIaErro(null);
    try {
      const res = await fetch('/api/anuncios/rascunho', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          seller_id: sellerId,
          titulo: titulo.trim(),
          gtin: gtin.trim(),
          marca: marca.trim(),
          modelo: modelo.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setIaErro(json?.erro ?? 'A IA não respondeu.');
        return;
      }
      if (json.category_id && !/^ML[A-Z]\d+$/.test(categoryId.trim())) setCategoryId(json.category_id);
      if (json.marca && !marca.trim()) setMarca(json.marca);
      if (json.modelo && !modelo.trim()) setModelo(json.modelo);
      if (json.descricao && !descricao.trim()) setDescricao(json.descricao);
      const atrs = (json.atributos ?? []) as { nome: string; valor: string }[];
      if (atrs.length) setFichaWeb(atrs);
      setPreenchidoPorIa(true);
    } catch (e) {
      setIaErro(e instanceof Error ? e.message : String(e));
    } finally {
      setPreenchendoIa(false);
    }
  }

  async function buscarFichaWeb() {
    if (titulo.trim().length < 5 && !(marca.trim() && modelo.trim())) return;
    setBuscandoFichaWeb(true);
    setFichaWebMsg(null);
    setFichaWeb(null);
    setFichaWebFontes([]);
    try {
      const res = await fetch('/api/anuncios/ficha-web', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ titulo: titulo.trim(), marca: marca.trim(), modelo: modelo.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setFichaWebMsg(json?.erro ?? 'Falha ao buscar na web.');
        return;
      }
      setFichaWebFontes(json.fontes ?? []);
      const atrs = (json.atributos ?? []) as { nome: string; valor: string }[];
      if (atrs.length) {
        setFichaWeb(atrs);
        setUsouFoto(true);
      } else {
        setFichaWebMsg(json.aviso ?? 'Nada aproveitável encontrado.');
      }
    } catch (e) {
      setFichaWebMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBuscandoFichaWeb(false);
    }
  }

  async function sugerirCategoria(qOverride?: string) {
    const q = (qOverride ?? titulo).trim();
    if (q.length < 3) return;
    setSugerindo(true);
    setSugestoes(null);
    setEscolhaIa(null);
    try {
      const p = new URLSearchParams({ q, seller_id: sellerId });
      const res = await fetch(`/api/anuncios/categoria?${p}`);
      const json = await res.json();
      if (!res.ok) {
        setSugestoes([]);
        return;
      }
      setSugestoes(json.sugestoes ?? []);
      setEscolhaIa(json.escolha ?? null);
      // A IA escolhe se puder; senão, o primeiro do preditor do ML.
      const alvo = json.escolha?.category_id ?? json.sugestoes?.[0]?.category_id;
      if (alvo) setCategoryId(alvo);
    } catch {
      setSugestoes([]);
    } finally {
      setSugerindo(false);
    }
  }

  async function chamarIa(acao: 'descricao' | 'roteiro-fotos' | 'ficha-da-foto') {
    if (acao !== 'ficha-da-foto' && titulo.trim().length < 5) return;
    if (acao === 'ficha-da-foto' && !/^https?:\/\/\S+$/i.test(fotoFichaUrl.trim())) return;
    if (acao === 'descricao' && descricao.trim() && !window.confirm('Substituir a descrição atual pelo texto gerado?')) {
      return;
    }
    setIaCarregando(acao);
    setIaErro(null);
    try {
      const res = await fetch('/api/anuncios/ia', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          acao,
          titulo: titulo.trim(),
          marca: marca.trim(),
          modelo: modelo.trim(),
          category_id: categoryId.trim(),
          category_nome: categoriaNome,
          tem_fotos: fotos.length > 0,
          foto_url: fotoFichaUrl.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setIaErro(json?.erro ?? 'A IA não respondeu.');
        return;
      }
      if (acao === 'descricao') setDescricao(json.sugestao ?? '');
      else if (acao === 'roteiro-fotos') setRoteiroFotos(json.fotos ?? []);
      else {
        setFichaDaFoto(json.atributos ?? []);
        setUsouFoto(true);
        if (!titulo.trim() && json.titulo_sugerido) setTituloSugerido(json.titulo_sugerido);
      }
    } catch (e) {
      setIaErro(e instanceof Error ? e.message : String(e));
    } finally {
      setIaCarregando(null);
    }
  }

  async function buscarFichaGtin() {
    const cod = gtin.trim();
    if (cod.length < 8) return;
    setBuscandoFicha(true);
    setFichaGtinMsg(null);
    setFichaGtin(null);
    setFichaGtinProdutoId(null);
    try {
      const p = new URLSearchParams({ gtin: cod, seller_id: sellerId });
      const res = await fetch(`/api/anuncios/ficha-por-gtin?${p}`);
      const json = await res.json();
      if (!res.ok) {
        setFichaGtinMsg(json?.erro ?? 'Falha ao buscar a ficha.');
        return;
      }
      if (!json.achado) {
        setFichaGtinMsg('Nada no catálogo do Mercado Livre para esse código — preencha a ficha na mão ou use "Extrair ficha da foto".');
        return;
      }
      const atrs = (json.atributos ?? []) as { id: string; nome: string; valor: string }[];
      setFichaGtin(atrs);
      setFichaGtinMarcados(Object.fromEntries(atrs.map((a) => [a.id, true])));
      // Plano 033 — se o GTIN resolve pra um produto de catálogo, o modo "Do catálogo" traz tudo.
      if (json.produto_id) setFichaGtinProdutoId(String(json.produto_id));
      if (!titulo.trim() && json.titulo_sugerido) setTituloSugerido(json.titulo_sugerido);
      if (!/^ML[A-Z]\d+$/.test(categoryId.trim()) && json.titulo_sugerido) {
        void sugerirCategoria(json.titulo_sugerido);
      }
    } catch (e) {
      setFichaGtinMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBuscandoFicha(false);
    }
  }

  function origemFicha(): string {
    const temGtin = (fichaGtin ?? []).some((a) => fichaGtinMarcados[a.id] !== false);
    if (temGtin && usouFoto) return 'gtin+foto';
    if (temGtin) return 'gtin';
    if (usouFoto) return 'foto';
    return 'manual';
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
          atributos_extra: (fichaGtin ?? [])
            .filter((a) => fichaGtinMarcados[a.id] !== false)
            .map((a) => ({ id: a.id, value_name: a.valor })),
          origem_ficha: origemFicha(),
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
      {preenchidoPorIa ? (
        <p style={{ margin: '0 0 12px' }}>
          <Selo nivel="atencao">preenchido pela IA</Selo> confira <strong>todos</strong> os campos
          antes de publicar — categoria, marca, modelo, ficha e descrição são sugestão.
        </p>
      ) : null}

      <Secao
        titulo="1. Produto"
        acao={
          <button
            type="button"
            className="btn pequeno primary"
            onClick={preencherComIa}
            disabled={preenchendoIa || titulo.trim().length < 10}
          >
            {preenchendoIa ? 'Preenchendo…' : 'Preencher com IA'}
          </button>
        }
      >
        <small>
          Põe o título (e o GTIN, se tiver) e clique — a IA sugere categoria, marca, modelo, ficha
          e descrição. Foto continua com você: o ML exige foto real do produto.
        </small>
        <div className="campo pilha" style={campo}>
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
              onClick={() => sugerirCategoria()}
              disabled={sugerindo || titulo.trim().length < 3}
            >
              {sugerindo ? 'Buscando…' : 'Sugerir pelo título'}
            </button>
          </div>
        </div>
        {tituloSugerido && !titulo.trim() ? (
          <p style={{ margin: '6px 0 0' }}>
            <button
              type="button"
              className="btn pequeno"
              onClick={() => {
                setTitulo(tituloSugerido);
                setTituloSugerido(null);
              }}
            >
              Usar título sugerido: “{tituloSugerido.slice(0, 60)}”
            </button>
          </p>
        ) : null}
        {escolhaIa ? (
          <p style={{ margin: '8px 0 0' }}>
            <button
              type="button"
              className="btn pequeno primary"
              onClick={() => setCategoryId(escolhaIa.category_id)}
            >
              IA recomenda: {escolhaIa.category_id}
            </button>{' '}
            <small>{escolhaIa.motivo}</small>
          </p>
        ) : null}
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
          <div className="ctrl" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              type="text"
              value={gtin}
              onChange={(e) => setGtin(e.target.value)}
              placeholder="7891234567890"
              style={{ maxWidth: 200 }}
            />
            <button
              type="button"
              className="btn pequeno"
              onClick={buscarFichaGtin}
              disabled={buscandoFicha || gtin.trim().length < 8}
            >
              {buscandoFicha ? 'Buscando…' : 'Buscar ficha pelo código'}
            </button>
          </div>
        </div>
        {fichaGtinMsg ? <small className="vazio">{fichaGtinMsg}</small> : null}
        {fichaGtinProdutoId && onTrocarParaCatalogo ? (
          <div className="card" style={{ marginTop: 8 }}>
            <p style={{ margin: 0 }}>
              <Selo nivel="atencao">catálogo</Selo> Este produto já tem página no catálogo do
              Mercado Livre (<code>{fichaGtinProdutoId}</code>). O modo <strong>Do catálogo</strong>{' '}
              traz título, <strong>fotos reais</strong> e ficha prontos — quase sem digitação.
            </p>
            <p style={{ margin: '8px 0 0' }}>
              <button
                type="button"
                className="btn primary pequeno"
                onClick={() =>
                  onTrocarParaCatalogo({
                    sellerId,
                    marca: marca.trim() || undefined,
                    modelo: modelo.trim() || undefined,
                    codigo: gtin.trim() || undefined,
                  })
                }
              >
                Ir pro modo Do catálogo
              </button>
            </p>
          </div>
        ) : null}
        {fichaGtin && fichaGtin.length > 0 ? (
          <div className="card" style={{ marginTop: 8 }}>
            <small>
              <Selo semIcone>{fichaGtin.length} atributos do catálogo do ML</Selo>{' '}
              Vão pra ficha do anúncio junto de Marca/Modelo. Desmarque o que não quiser.
            </small>
            <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
              {fichaGtin.map((a) => (
                <label key={a.id} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  <input
                    type="checkbox"
                    checked={fichaGtinMarcados[a.id] !== false}
                    onChange={(e) =>
                      setFichaGtinMarcados((m) => ({ ...m, [a.id]: e.target.checked }))
                    }
                  />
                  <span>
                    <strong>{a.nome}:</strong> {a.valor}
                  </span>
                </label>
              ))}
            </div>
          </div>
        ) : null}

        <div className="campo pilha" style={campo}>
          <div className="rot">Extrair ficha de uma foto (etiqueta / manual / caixa)</div>
          <div className="ctrl" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              type="text"
              value={fotoFichaUrl}
              onChange={(e) => setFotoFichaUrl(e.target.value)}
              placeholder="https://…/foto-da-etiqueta.jpg"
            />
            <button
              type="button"
              className="btn pequeno"
              onClick={() => chamarIa('ficha-da-foto')}
              disabled={iaCarregando !== null || !/^https?:\/\/\S+$/i.test(fotoFichaUrl.trim())}
            >
              {iaCarregando === 'ficha-da-foto' ? 'Lendo…' : 'Extrair ficha da foto (IA)'}
            </button>
          </div>
        </div>
        {fichaDaFoto && fichaDaFoto.length > 0 ? (
          <div className="card" style={{ marginTop: 8 }}>
            <small>
              <Selo nivel="atencao">sugestão da foto — confira antes de usar</Selo> A IA leu o que
              estava legível. Copie pro campo certo ou peça pro Livio revisar; não entra no anúncio
              automaticamente.
            </small>
            <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
              {fichaDaFoto.map((a, i) => (
                <li key={i}>
                  <strong>{a.nome}:</strong> {a.valor}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="campo pilha" style={campo}>
          <div className="rot">Buscar ficha no site da marca</div>
          <div className="ctrl">
            <button
              type="button"
              className="btn pequeno"
              onClick={buscarFichaWeb}
              disabled={
                buscandoFichaWeb ||
                (titulo.trim().length < 5 && !(marca.trim() && modelo.trim()))
              }
            >
              {buscandoFichaWeb ? 'Buscando na web…' : 'Buscar ficha no site da marca (IA)'}
            </button>
          </div>
        </div>
        {fichaWebMsg ? <small className="vazio">{fichaWebMsg}</small> : null}
        {fichaWeb && fichaWeb.length > 0 ? (
          <div className="card" style={{ marginTop: 8 }}>
            <small>
              <Selo nivel="atencao">specs da web — confira antes de publicar</Selo> Só
              especificações factuais, extraídas das páginas abaixo. A descrição é reescrita, não
              copiada. Não entra nos atributos do ML sozinho.
            </small>
            <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
              {fichaWeb.map((a, i) => (
                <li key={i}>
                  <strong>{a.nome}:</strong> {a.valor}
                </li>
              ))}
            </ul>
            {fichaWebFontes.length ? (
              <small style={{ display: 'block', marginTop: 8 }}>
                Fontes:{' '}
                {fichaWebFontes.map((u, i) => (
                  <span key={i}>
                    {i > 0 ? ' · ' : ''}
                    <a href={u} target="_blank" rel="noreferrer">
                      {(() => {
                        try {
                          return new URL(u).hostname;
                        } catch {
                          return u.slice(0, 40);
                        }
                      })()}
                    </a>
                  </span>
                ))}
              </small>
            ) : null}
          </div>
        ) : null}

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

      <Secao
        titulo="3. Fotos (URLs, uma por linha)"
        acao={
          <button
            type="button"
            className="btn pequeno"
            onClick={() => chamarIa('roteiro-fotos')}
            disabled={iaCarregando !== null || titulo.trim().length < 5}
          >
            {iaCarregando === 'roteiro-fotos' ? 'Gerando…' : 'Roteiro de fotos (IA)'}
          </button>
        }
      >
        {roteiroFotos && roteiroFotos.length > 0 ? (
          <div className="card" style={{ marginBottom: 12 }}>
            <small>
              A IA <strong>não gera as fotos</strong> — o Mercado Livre exige foto real do
              produto. Tire estas e cole as URLs abaixo:
            </small>
            <ol style={{ margin: '8px 0 0', paddingLeft: 20 }}>
              {roteiroFotos.map((f, i) => (
                <li key={i} style={{ marginTop: 4 }}>
                  <strong>{f.titulo}</strong>
                  {f.descricao ? ` — ${f.descricao}` : ''}
                </li>
              ))}
            </ol>
          </div>
        ) : null}
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

      <Secao
        titulo="5. Descrição (opcional)"
        acao={
          <button
            type="button"
            className="btn pequeno"
            onClick={() => chamarIa('descricao')}
            disabled={iaCarregando !== null || titulo.trim().length < 5}
          >
            {iaCarregando === 'descricao' ? 'Gerando…' : 'Gerar com IA'}
          </button>
        }
      >
        <div className="ctrl">
          <textarea
            rows={6}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Texto simples. Sem HTML, sem emoji. Dá pra melhorar depois na tela de Descrição."
            style={{ width: '100%', fontFamily: 'inherit', resize: 'vertical' }}
          />
        </div>
        <small>
          A IA se baseia só no título, marca, modelo e categoria — confira antes de publicar. Dá
          pra refinar depois na tela de Descrição, com a ficha e as perguntas reais.
        </small>
      </Secao>

      {iaErro ? (
        <p style={{ margin: '0 0 8px' }}>
          <Selo nivel="atencao">IA</Selo> {iaErro}
        </p>
      ) : null}

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
              {resultado.id ? (
                <p style={{ margin: '8px 0 0' }}>
                  <a className="btn pequeno" href={`/itens/${resultado.id}/fotos`}>
                    Padronizar as fotos (quadrado / fundo branco)
                  </a>
                </p>
              ) : null}
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
