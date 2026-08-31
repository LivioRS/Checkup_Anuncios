'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Anel, Medidor, Selo, Secao } from '@/components/ui';
import {
  DIMENSOES,
  grudarBlocos,
  temBlocos,
  temOrigem,
  inserirOrigem,
  type Notas,
} from '@/lib/ia-tipos';

type Ocupado = null | 'analisar' | 'melhorar' | 'salvar' | 'blocos';

/** 0–10: até 4 crítico, até 7 atenção, acima bom. */
function nivelDaNota(n: number) {
  if (n >= 8) return 'bom' as const;
  if (n >= 5) return 'atencao' as const;
  return 'critico' as const;
}

export default function EditorDescricao({
  itemId,
  atual,
  temIA,
  origemFicha = null,
  origemNaFicha = false,
  origemNome = 'Origem',
}: {
  itemId: string;
  atual: string;
  temIA: boolean;
  /** Valor da origem lido da ficha técnica, quando existe. */
  origemFicha?: string | null;
  /** A categoria tem campo de origem? Quando não tem, você digita aqui. */
  origemNaFicha?: boolean;
  origemNome?: string;
}) {
  const [melhorada, setMelhorada] = useState('');
  const [notas, setNotas] = useState<Notas | null>(null);
  const [geral, setGeral] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState<Ocupado>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; msg: string } | null>(null);

  const [sobre, setSobre] = useState('');
  const [garantia, setGarantia] = useState('');
  const [blocosCarregados, setBlocosCarregados] = useState(false);
  const [blocosSalvos, setBlocosSalvos] = useState(true);
  const [loja, setLoja] = useState('');
  const [fontes, setFontes] = useState('');
  const [origem, setOrigem] = useState(origemFicha ?? '');
  const [sugestao, setSugestao] = useState<{ sobre: string; garantia: string } | null>(null);
  const [rascunho, setRascunho] = useState(false);

  /**
   * As fontes ficam salvas no navegador, por anúncio.
   *
   * É material que dá trabalho de juntar — manual, catálogo, outro anúncio — e
   * perder isso num F5 seria péssimo. Fica só na sua máquina, não vai para o
   * banco nem para o ML; é rascunho de trabalho, não dado do anúncio.
   */
  const chaveFontes = `fontes:${itemId}`;

  useEffect(() => {
    try {
      setFontes(localStorage.getItem(chaveFontes) ?? '');
      // Origem digitada também sobrevive ao F5, mas a ficha sempre vence.
      if (!origemFicha) setOrigem(localStorage.getItem(`origem:${itemId}`) ?? '');
    } catch {
      /* navegador sem storage: segue sem lembrar */
    }
  }, [chaveFontes, itemId, origemFicha]);

  /**
   * A cobrança da origem acontece DEPOIS de gerar, e sobre o texto.
   * Gerar continua livre: o Claude tenta pôr a origem sozinho, e só quando ele
   * não consegue — porque o dado não existe em lugar nenhum — a tela pede.
   */
  const faltaOrigemNoTexto = !!melhorada.trim() && !temOrigem(melhorada);

  useEffect(() => {
    fetch('/api/blocos')
      .then((r) => r.json())
      .then((j) => {
        setLoja(j.loja ?? '');
        setSugestao(j.sugestao ?? null);

        /**
         * Campo vazio entra com o rascunho já escrito.
         *
         * O que estava salvo NUNCA é sobrescrito — só o vazio recebe sugestão.
         * E, quando isso acontece, marcamos como não salvo: o texto está na
         * tela, mas só vira o bloco da loja depois que você revisar e salvar.
         */
        const temSobre = !!j.sobre;
        const temGarantia = !!j.garantia;
        setSobre(temSobre ? j.sobre : (j.sugestao?.sobre ?? ''));
        setGarantia(temGarantia ? j.garantia : (j.sugestao?.garantia ?? ''));
        const preencheu = (!temSobre && j.sugestao?.sobre) || (!temGarantia && j.sugestao?.garantia);
        setRascunho(!!preencheu);
        setBlocosSalvos(!preencheu);
        setBlocosCarregados(true);
      })
      .catch(() => setBlocosCarregados(true));
  }, []);

  async function analisar() {
    setOcupado('analisar');
    setAviso(null);
    try {
      const res = await fetch(`/api/descricao/${itemId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ acao: 'analisar' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.erro ?? 'falhou');
      setNotas(json.notas);
      setGeral(json.geral);
    } catch (e) {
      setAviso({ ok: false, msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setOcupado(null);
    }
  }

  async function melhorar() {
    setOcupado('melhorar');
    setAviso(null);
    try {
      const res = await fetch(`/api/descricao/${itemId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          acao: 'melhorar',
          notas,
          fontes,
          // Manda o que está na tela: não depende de você ter salvo antes.
          blocos: { sobre, garantia },
          origem,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.erro ?? 'falhou');
      setMelhorada(json.sugestao ?? '');
      if (!json.usouBlocos) {
        setAviso({
          ok: true,
          msg: 'Texto gerado. Os blocos da loja estão vazios — preencha abaixo para eles entrarem.',
        });
      }
    } catch (e) {
      setAviso({ ok: false, msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setOcupado(null);
    }
  }

  async function salvarBlocos() {
    setOcupado('blocos');
    try {
      const res = await fetch('/api/blocos', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sobre, garantia }),
      });
      if (!res.ok) throw new Error((await res.json()).erro ?? 'falhou');
      setBlocosSalvos(true);
      setAviso({ ok: true, msg: 'Blocos da loja salvos.' });
    } catch (e) {
      setAviso({ ok: false, msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setOcupado(null);
    }
  }

  async function atualizarNoML() {
    setOcupado('salvar');
    setAviso(null);
    try {
      const res = await fetch(`/api/descricao/${itemId}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plain_text: melhorada, origem }),
      });
      const json = await res.json();
      if (!res.ok) {
        const causa = (json?.body?.cause ?? []) as { message?: string; references?: string[] }[];
        const detalhe = causa
          .map((c) => `${c.message ?? ''} ${c.references?.join(',') ?? ''}`)
          .join(' · ');
        throw new Error(detalhe || json.erro || 'o ML recusou');
      }
      setAviso({ ok: true, msg: `Descrição publicada (${json.caracteres} caracteres).` });
    } catch (e) {
      setAviso({ ok: false, msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setOcupado(null);
    }
  }

  // Só o que ficou abaixo de 8 vira lista de ação, da pior para a melhor.
  const fracas = notas
    ? DIMENSOES.flatMap((d) => {
        const n = notas[d.chave];
        return n && n.nota < 8 ? [{ chave: d.chave as string, ...n }] : [];
      }).sort((a, b) => a.nota - b.nota)
    : [];

  return (
    <>
      {/* ---------- notas por dimensão ---------- */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14 }}>
          <h2 style={{ margin: 0 }}>Análise da descrição</h2>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn" disabled={!temIA || ocupado !== null} onClick={analisar}>
              {ocupado === 'analisar' ? 'Analisando…' : 'Analisar descrição'}
            </button>
            <button
              className="btn primary"
              disabled={!temIA || ocupado !== null}
              onClick={melhorar}
            >
              {ocupado === 'melhorar' ? 'Escrevendo…' : 'Melhorar descrição'}
            </button>
          </div>
        </div>

        {notas ? (
          <>
            <div className="destaque">
              <div className="lado">
                <Anel
                  valor={geral ?? 0}
                  max={10}
                  sufixo=""
                  nivel={nivelDaNota(geral ?? 0)}
                  legenda="Qualidade geral"
                  detalhe={<small>média das dez · nota do Claude</small>}
                />
              </div>
              <div className="grade">
                <div className="medidores">
                  {DIMENSOES.map((d) => {
                    const n = notas[d.chave];
                    if (!n) return null;
                    return (
                      <Medidor
                        key={d.chave}
                        valor={n.nota}
                        max={10}
                        sufixo=""
                        casas={1}
                        rotulo={d.rotulo}
                        nivel={nivelDaNota(n.nota)}
                      />
                    );
                  })}
                </div>
              </div>
            </div>

            {fracas.length ? (
              <div style={{ marginTop: 22, borderTop: '1px solid var(--linha)', paddingTop: 16 }}>
                <h3>O que corrigir</h3>
                <table className="tabela">
                  <tbody>
                    {fracas.map((n) => (
                      <tr key={n.chave}>
                        <td className="rotulo">
                          {DIMENSOES.find((d) => d.chave === n.chave)?.rotulo ?? n.chave}
                        </td>
                        <td style={{ width: 70 }}>
                          <Selo nivel={nivelDaNota(n.nota)}>{n.nota.toFixed(1)}</Selo>
                        </td>
                        <td>{n.observacao}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ marginTop: 18, marginBottom: 0 }}>
                <Selo nivel="bom">nada a corrigir</Selo> Todas as dimensões passaram de 8.
              </p>
            )}
          </>
        ) : (
          <p className="vazio" style={{ margin: 0 }}>
            {temIA
              ? 'Clique em Analisar para pontuar cada parte da descrição.'
              : 'Configure ANTHROPIC_API_KEY no .env.local para usar a análise.'}
          </p>
        )}
      </div>

      {/* ---------- duas colunas ---------- */}
      <div className="grid k2">
        <section className="card">
          <h2>Descrição atual no ML</h2>
          <pre className="texto" style={{ maxHeight: 420 }}>
            {atual || '(vazia)'}
          </pre>
          <p style={{ margin: '10px 0 0' }}>
            <small>{atual.length.toLocaleString('pt-BR')} caracteres</small>
          </p>
        </section>

        <section className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <h2 style={{ margin: 0 }}>Descrição melhorada</h2>
            {melhorada ? <Selo nivel="atencao">não publicada</Selo> : null}
            <button
              className="btn primary pequeno"
              style={{ marginLeft: 'auto' }}
              disabled={!melhorada.trim() || ocupado !== null || faltaOrigemNoTexto}
              title={
                faltaOrigemNoTexto ? 'A descrição precisa informar a origem do produto' : undefined
              }
              onClick={atualizarNoML}
            >
              {ocupado === 'salvar' ? 'Publicando…' : 'Publicar no ML'}
            </button>
          </div>
          <textarea
            value={melhorada}
            onChange={(e) => setMelhorada(e.target.value)}
            rows={18}
            placeholder="Clique em Melhorar descrição, ou escreva aqui você mesmo."
            style={{ fontFamily: 'inherit', lineHeight: 1.5 }}
          />
          <p style={{ margin: '10px 0 0' }}>
            <small>{melhorada.length.toLocaleString('pt-BR')} caracteres · edite antes de publicar</small>
          </p>

          {/* Origem: cobrada aqui, sobre o texto, e só quando falta mesmo. */}
          {faltaOrigemNoTexto ? (
            <div className="card plano" style={{ marginTop: 12, padding: '14px 16px' }}>
              <p style={{ margin: '0 0 8px' }}>
                <Selo nivel="critico">falta a origem</Selo>{' '}
                <small>
                  O texto gerado não informa a origem do produto
                  {origemNaFicha && !origemFicha
                    ? ` — o campo "${origemNome}" também está vazio na ficha`
                    : ''}
                  . Informe abaixo para inserir a linha nas características e liberar a publicação.
                </small>
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  type="text"
                  value={origem}
                  placeholder="Ex.: Brasil, China, Importado"
                  style={{ flex: '1 1 220px' }}
                  onChange={(e) => {
                    setOrigem(e.target.value);
                    try {
                      localStorage.setItem(`origem:${itemId}`, e.target.value);
                    } catch {
                      /* sem storage */
                    }
                  }}
                />
                <button
                  className="btn pequeno primary"
                  disabled={!origem.trim()}
                  onClick={() => setMelhorada(inserirOrigem(melhorada, origem))}
                >
                  Inserir na descrição
                </button>
              </div>
              {origemNaFicha ? (
                <p style={{ margin: '8px 0 0' }}>
                  <small>
                    Vale preencher também na ficha, em <strong>{origemNome}</strong> — é de lá que o
                    Mercado Livre lê a origem.{' '}
                    <Link href={`/itens/${itemId}/ficha`}>Abrir a ficha</Link>
                  </small>
                </p>
              ) : (
                <p style={{ margin: '8px 0 0' }}>
                  <small>
                    Esta categoria não tem campo de origem na ficha, então a descrição é o único
                    lugar onde essa informação cabe.
                  </small>
                </p>
              )}
            </div>
          ) : melhorada.trim() ? (
            <p style={{ margin: '10px 0 0' }}>
              <Selo nivel="bom">origem informada</Selo>
            </p>
          ) : null}

          {/* O que vai para o ML é ESTE texto. Se os blocos não estão aqui,
              eles não sobem — e é melhor você saber antes de publicar. */}
          {melhorada.trim() && (sobre.trim() || garantia.trim()) ? (
            temBlocos(melhorada, { sobre, garantia }) ? (
              <p style={{ margin: '10px 0 0' }}>
                <Selo nivel="bom">loja e garantia incluídas</Selo>
              </p>
            ) : (
              <p
                style={{
                  margin: '10px 0 0',
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <Selo nivel="critico">sem os blocos da loja</Selo>
                <button
                  className="btn pequeno"
                  onClick={() => setMelhorada(grudarBlocos(melhorada, { sobre, garantia }))}
                >
                  Anexar loja e garantia
                </button>
                <small>Só o que está nesta caixa vai para o Mercado Livre.</small>
              </p>
            )
          ) : null}
        </section>
      </div>

      {/* ---------- fontes coladas pelo vendedor ---------- */}
      <Secao
        titulo="Fontes"
        colapsavel
        aberta={!!fontes}
        resumo={
          fontes ? (
            <Selo nivel="bom">{fontes.length.toLocaleString('pt-BR')} caracteres</Selo>
          ) : (
            <Selo semIcone>vazio</Selo>
          )
        }
        acao={
          fontes ? (
            <button
              className="btn pequeno"
              onClick={() => {
                setFontes('');
                try {
                  localStorage.removeItem(chaveFontes);
                } catch {
                  /* sem storage */
                }
              }}
            >
              Limpar
            </button>
          ) : null
        }
      >
        <p style={{ marginTop: 0 }}>
          <small>
            Cole aqui o que você tiver do produto: manual e ficha do fabricante, texto de catálogo,
            descrição de outro anúncio seu, especificação do distribuidor. Isso entra na reescrita
            como <strong>fonte de fato</strong> — o Claude tira dali especificação, função, medida e
            o que acompanha, e escreve com as próprias palavras.
          </small>
        </p>
        <p>
          <small>
            Três regras que deixei no prompt: cópia literal é proibida (texto de outro vendedor é
            trabalho dele, e cópia derruba anúncio por denúncia); se o material contradisser a ficha
            técnica, <strong>a ficha vence</strong>; e preço, prazo, frete, contato e nome de outra
            loja são descartados.
          </small>
        </p>
        <textarea
          value={fontes}
          onChange={(e) => {
            setFontes(e.target.value);
            try {
              localStorage.setItem(chaveFontes, e.target.value);
            } catch {
              /* sem storage */
            }
          }}
          rows={14}
          placeholder={
            'Cole aqui o material bruto. Pode ser bagunçado — lista solta, texto corrido, ' +
            'tabela copiada do site do fabricante. Vale mais quantidade de informação real que organização.'
          }
        />
        <p style={{ margin: '8px 0 0' }}>
          <small>
            Fica salvo no seu navegador para este anúncio — não vai para o banco nem para o Mercado
            Livre.
          </small>
        </p>
      </Secao>

      {/* ---------- blocos fixos da loja ---------- */}
      <Secao
        titulo={loja ? `Blocos fixos — ${loja}` : 'Blocos fixos da loja'}
        acao={
          <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {sugestao ? (
              <button
                className="btn pequeno"
                onClick={() => {
                  setSobre(sugestao.sobre);
                  setGarantia(sugestao.garantia);
                  setBlocosSalvos(false);
                  setRascunho(true);
                }}
                disabled={ocupado !== null}
                title="Substitui os dois campos pelo texto sugerido"
              >
                Restaurar sugestão
              </button>
            ) : null}
            <button
              className="btn pequeno primary"
              onClick={salvarBlocos}
              disabled={ocupado !== null || blocosSalvos}
            >
              {ocupado === 'blocos' ? 'Salvando…' : 'Salvar blocos'}
            </button>
          </span>
        }
      >
        <p style={{ marginTop: 0 }}>
          <small>
            Anexados ao fim de toda descrição gerada, sem reescrita. Valem para a conta inteira
            {loja ? ` (${loja})` : ''}.
          </small>
        </p>

        {rascunho ? (
          <p style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <Selo nivel="atencao">rascunho</Selo>
            <small>
              Preenchi com uma sugestão para você não começar do zero. Confira principalmente
              prazos e o que a garantia cobre — isso varia por loja e eu não tenho como saber o que
              você pratica. Nada é anexado a descrição nenhuma antes de você salvar.
            </small>
          </p>
        ) : null}
        <div className="grid k2" style={{ marginBottom: 0 }}>
          <div>
            <h3>Sobre a loja</h3>
            <textarea
              value={sobre}
              onChange={(e) => {
                setSobre(e.target.value);
                setBlocosSalvos(false);
              }}
              rows={7}
              disabled={!blocosCarregados}
              placeholder="Quem é a loja, tempo de mercado, atendimento, nota fiscal…"
            />
          </div>
          <div>
            <h3>Garantia</h3>
            <textarea
              value={garantia}
              onChange={(e) => {
                setGarantia(e.target.value);
                setBlocosSalvos(false);
              }}
              rows={7}
              disabled={!blocosCarregados}
              placeholder="Prazo, o que cobre, como acionar…"
            />
          </div>
        </div>
      </Secao>

      {aviso ? (
        <p style={{ margin: '0 0 8px' }}>
          <Selo nivel={aviso.ok ? 'bom' : 'critico'}>{aviso.msg}</Selo>
        </p>
      ) : null}

      <p>
        <Link className="btn" href={`/itens/${itemId}`}>
          Voltar ao check-up
        </Link>
      </p>
    </>
  );
}
