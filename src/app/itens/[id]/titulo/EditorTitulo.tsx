'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Selo } from '@/components/ui';
import {
  LIMITE_TITULO,
  LIMITE_MODELO_PADRAO,
  montarModelo,
  repetidasEm,
  repetidasEntre,
  type PlanoTitulo,
} from '@/lib/ia-tipos';
import { noTitulo } from '@/lib/ml/tendencias';

type Resposta = {
  plano: PlanoTitulo;
  atual: string;
  modeloAtual: string | null;
  limiteModelo: number | null;
  podeGravar: boolean;
  catalogo: boolean;
};

const INTENCAO = ['Alcance', 'Cauda longa', 'Equilíbrio'];

/**
 * Abre o motivo real da recusa.
 *
 * O ML manda o detalhe em `cause`, e é sempre ali que está o que resolve:
 * qual campo, qual regra. Mostrar só "recusou a alteração" transforma um
 * recado útil num beco sem saída.
 */
function motivoDaRecusa(json: unknown): string {
  try {
    const j = json as { erro?: string; body?: Record<string, unknown> };
    const body = j?.body ?? {};
    const partes: string[] = [];

    const texto = (v: unknown): string => {
      if (v === null || v === undefined) return '';
      if (typeof v === 'string') return v.trim();
      if (typeof v === 'number' || typeof v === 'boolean') return String(v);
      if (Array.isArray(v)) return v.map(texto).filter(Boolean).join(' · ');
      const o = v as Record<string, unknown>;
      return ['code', 'message', 'cause', 'department']
        .map((k) => texto(o[k]))
        .filter(Boolean)
        .join(' · ');
    };

    for (const chave of ['message', 'error', 'cause']) {
      const t = texto(body[chave]);
      if (t && !partes.includes(t)) partes.push(t);
    }
    if (!partes.length && j?.erro) partes.push(j.erro);

    return partes.join(' — ').slice(0, 500) || 'O ML recusou e não explicou o motivo.';
  } catch (e) {
    // Nunca deixar a leitura do erro virar outro erro na cara do usuário.
    return `Não consegui ler a resposta do ML (${e instanceof Error ? e.message : String(e)}).`;
  }
}

/** Contador de caracteres: número cheio à esquerda, folga à direita. */
function Contador({ usado, limite }: { usado: number; limite: number }) {
  const livres = limite - usado;
  return (
    <>
      <Selo mono semIcone>
        {usado}/{limite}
      </Selo>
      <Selo nivel={livres < 0 ? 'critico' : livres < 8 ? 'atencao' : 'bom'}>
        {livres < 0 ? `${-livres} a mais` : `${livres} livres`}
      </Selo>
    </>
  );
}

export default function EditorTitulo({
  itemId,
  atual,
  familia = null,
  vendas = 0,
  modeloAtual,
  limiteModelo,
  modeloLista = [],
  modeloTravado = false,
  modeloExiste = true,
  podeGravar,
  catalogo,
  temIA,
}: {
  itemId: string;
  atual: string;
  /** family_name do item. Quando existe, é ele que vale como título no ML. */
  familia?: string | null;
  /** Vendas do item: o ML só deixa mexer no family_name enquanto não há venda. */
  vendas?: number;
  modeloAtual: string | null;
  limiteModelo: number | null;
  /** Valores fixos que a categoria aceita em MODEL; vazio = texto livre. */
  modeloLista?: string[];
  /** A categoria marca MODEL como não editável pelo vendedor. */
  modeloTravado?: boolean;
  modeloExiste?: boolean;
  podeGravar: boolean;
  catalogo: boolean;
  temIA: boolean;
}) {
  const router = useRouter();
  const [carregando, setCarregando] = useState(false);
  const [r, setR] = useState<Resposta | null>(null);
  const [titulo, setTitulo] = useState(atual);
  const [modelo, setModelo] = useState(modeloAtual ?? '');
  const [publicando, setPublicando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; msg: string } | null>(null);
  const campoModelo = useRef<HTMLTextAreaElement>(null);

  /**
   * Depois de acrescentar uma palavra, leva o campo para o fim.
   *
   * Sem isso o texto novo entra fora da área visível e você teria que rolar
   * até lá para ver o que acabou de clicar. O React só escreve o valor no
   * próximo quadro, por isso o requestAnimationFrame.
   */
  function mostrarFimDoModelo() {
    requestAnimationFrame(() => {
      const el = campoModelo.current;
      if (!el) return;
      el.focus();
      const fim = el.value.length;
      el.setSelectionRange(fim, fim);
      el.scrollTop = el.scrollHeight;
    });
  }

  function trocarModelo(valor: string) {
    setModelo(valor);
    mostrarFimDoModelo();
  }

  const declarado = r?.limiteModelo ?? limiteModelo;
  const limMod = declarado ?? LIMITE_MODELO_PADRAO;

  // Repetição escrita na mão também precisa aparecer, não só a que eu evito.
  const repTitulo = repetidasEm(titulo);
  const repModelo = repetidasEm(modelo);
  const repCruzada = repetidasEntre(titulo, modelo);

  const mudouTitulo = titulo.trim() !== atual.trim();
  const mudouModelo = modelo.trim() !== (modeloAtual ?? '').trim();

  /**
   * O modelo é montado a partir do título QUE ESTÁ NA TELA, não do publicado.
   * É por isso que a ordem importa: mexeu no título, a sugestão de modelo se
   * refaz na hora e para de oferecer palavra que o título acabou de cobrir.
   */
  const montado = useMemo(
    () =>
      r?.plano.modelo
        ? montarModelo(r.plano.modelo.base, r.plano.modelo.termos, limMod, { evitar: titulo })
        : null,
    [r, limMod, titulo],
  );

  /**
   * Um termo já entrou?
   *
   * A resposta sai do texto que está no campo agora, não de uma lista do que
   * foi clicado. Assim, se você apagar a palavra na mão, a marca some sozinha —
   * a tela nunca diz "usado" para algo que não está mais lá.
   */
  const jaEntrou = (termo: string) => noTitulo(modelo, termo) || noTitulo(titulo, termo);

  /** Acrescenta um termo ao fim do modelo, sem repetir e sem passar do limite. */
  function juntarAoModelo(termo: string) {
    const base = modelo.trim();
    const junto = montarModelo(base, [termo], limMod, { evitar: titulo });
    if (junto.valor === base) {
      setAviso({
        ok: false,
        msg: junto.repetidos.length
          ? `"${termo}" já está no título ou no modelo.`
          : `"${termo}" não cabe: faltam ${termo.length + 1 - (limMod - base.length)} caracteres.`,
      });
      return;
    }
    setAviso(null);
    trocarModelo(junto.valor);
  }

  async function analisar() {
    setCarregando(true);
    setAviso(null);
    try {
      const res = await fetch(`/api/titulo/${itemId}`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) setAviso({ ok: false, msg: json?.erro ?? 'Falhou.' });
      else setR(json as Resposta);
    } catch (e) {
      setAviso({ ok: false, msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setCarregando(false);
    }
  }

  async function publicar() {
    setPublicando(true);
    setAviso(null);
    try {
      const res = await fetch(`/api/titulo/${itemId}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          titulo: mudouTitulo ? titulo.trim() : undefined,
          modelo: mudouModelo ? modelo.trim() : undefined,
        }),
      });
      const json = (await res.json()) as {
        versao?: string;
        modelo?: { ok: boolean; erro?: unknown };
        titulo?: {
          ok: boolean;
          campo?: string;
          erro?: unknown;
          travado?: {
            motivo: string;
            vendas: number;
            irmaos: { id: string; vendas: number; status?: string }[];
          } | null;
        };
        erro?: string;
      };

      // 207 = passou uma parte. Dizer QUAL passou vale mais que "erro".
      const partes: string[] = [];
      if (json.modelo) {
        partes.push(
          json.modelo.ok
            ? 'Modelo gravado.'
            : `Modelo recusado: ${motivoDaRecusa({ body: json.modelo.erro })}`,
        );
      }
      if (json.titulo) {
        if (json.titulo.ok) {
          partes.push(`Título gravado em ${json.titulo.campo}.`);
        } else if (json.titulo.travado) {
          const t = json.titulo.travado;
          partes.push(
            `Título travado pelo Mercado Livre: ${t.motivo} (${t.vendas} venda${t.vendas > 1 ? 's' : ''}). ` +
              'O nome da família só pode mudar enquanto nenhum anúncio dela tiver vendido — e este já vendeu. ' +
              'Não há caminho por API para destravar.',
          );
        } else {
          partes.push(`Título recusado: ${motivoDaRecusa({ body: json.titulo.erro })}`);
        }
      }
      if (!partes.length) partes.push(motivoDaRecusa(json));

      const tudoOk = res.ok && json.modelo?.ok !== false && json.titulo?.ok !== false;
      setAviso({
        ok: tudoOk,
        msg: `${partes.join(' ')}${json.versao ? ` [${json.versao}]` : ''}`,
      });
      if (json.modelo?.ok || json.titulo?.ok) router.refresh();
    } catch (e) {
      setAviso({ ok: false, msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setPublicando(false);
    }
  }

  return (
    <>
      <section className="card">
        <h2>Como está hoje</h2>
        <p className="texto" style={{ marginTop: 0 }}>
          {atual}
        </p>
        <p style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <Selo semIcone>título</Selo>
          <Contador usado={atual.length} limite={LIMITE_TITULO} />
        </p>
        <p style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <Selo semIcone>modelo</Selo>
          {modeloAtual ? (
            <>
              <span className="texto" style={{ margin: 0 }}>
                {modeloAtual}
              </span>
              <Contador usado={modeloAtual.length} limite={limMod} />
            </>
          ) : (
            <Selo nivel="atencao">vazio</Selo>
          )}
        </p>
        <p style={{ marginBottom: 0 }}>
          <button className="btn primary" disabled={!temIA || carregando} onClick={analisar}>
            {carregando ? 'Cruzando com as buscas…' : 'Sugerir'}
          </button>
          {temIA ? null : <small> Falta a ANTHROPIC_API_KEY no .env.local.</small>}
        </p>
      </section>

      {/* ---------- passo 1: título ---------- */}
      <section className="card">
        <h2>1. {familia ? 'Título (nome da família)' : 'Título'}</h2>
        <p style={{ marginTop: 0 }}>
          <small>
            Comece por aqui. O modelo é montado a partir do que estiver escrito neste campo — cada
            palavra que entra no título sai da sugestão de modelo automaticamente.
          </small>
        </p>

        {familia ? (
          <p style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <Selo nivel="atencao">família</Selo>
            <small>
              Este anúncio está no modelo de User Products, então o título vem do{' '}
              <code>family_name</code> — o ML recusa alteração direta em <code>title</code>. O
              painel grava o family_name, e o Mercado Livre replica em todos os anúncios do mesmo
              User Product, com alguns minutos de atraso.
              {vendas > 0 ? (
                <>
                  {' '}
                  <strong>
                    Este anúncio já tem {vendas} venda{vendas > 1 ? 's' : ''}, então o título
                    provavelmente está travado.
                  </strong>{' '}
                  O ML só libera trocar o nome da família enquanto NENHUM anúncio dela tiver
                  vendido. O modelo continua editável — ele não faz parte dessa regra.
                </>
              ) : null}
            </small>
          </p>
        ) : null}

        <div className="campo">
          <div className="rot">
            {familia ? 'Nome da família' : 'Título'}
            <div className="selos">
              <Contador usado={titulo.length} limite={LIMITE_TITULO} />
            </div>
            {familia ? (
              <small className="selo mono" style={{ marginTop: 6 }}>
                family_name
              </small>
            ) : null}
          </div>
          <div className="ctrl" style={{ display: 'block' }}>
            <input
              type="text"
              value={titulo}
              maxLength={LIMITE_TITULO + 20}
              onChange={(e) => setTitulo(e.target.value)}
            />
            {repTitulo.length ? (
              <p style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0 0' }}>
                <Selo nivel="atencao">palavra repetida</Selo>
                {repTitulo.map((p) => (
                  <Selo key={p} mono semIcone>
                    {p}
                  </Selo>
                ))}
                <small>O ML não conta duas vezes — a segunda só ocupa espaço.</small>
              </p>
            ) : null}
          </div>
        </div>

        {r
          ? r.plano.titulos.map((t, i) => (
              <div className="campo" key={t.texto}>
                <div className="rot">
                  <Selo semIcone>{INTENCAO[i] ?? `Opção ${i + 1}`}</Selo>
                  <div className="selos" style={{ marginTop: 6 }}>
                    <Contador usado={t.texto.length} limite={LIMITE_TITULO} />
                    {t.termos.map((x) => (
                      <Selo key={x} nivel="bom">
                        + {x}
                      </Selo>
                    ))}
                  </div>
                </div>
                <div className="ctrl" style={{ display: 'block' }}>
                  <p className="texto" style={{ marginTop: 0 }}>
                    {t.texto}
                  </p>
                  <p style={{ margin: '0 0 8px' }}>
                    <small>{t.motivo}</small>
                  </p>
                  <button className="btn pequeno" onClick={() => setTitulo(t.texto)}>
                    Usar este título
                  </button>
                </div>
              </div>
            ))
          : null}
      </section>

      {/* ---------- passo 2: modelo ---------- */}
      <section className="card">
        <h2>2. Modelo (MODEL)</h2>
        <p style={{ marginTop: 0 }}>
          <small>
            Modelo real primeiro, depois as palavras buscadas separadas por espaço, até encher o
            campo. Esta categoria aceita <strong>{limMod} caracteres</strong>
            {declarado == null ? ' (padrão — a categoria não declarou o dela)' : ''}. Quem conta e
            corta é o painel.
          </small>
        </p>

        {modeloTravado || modeloLista.length || !modeloExiste ? (
          <p style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
            {!modeloExiste ? (
              <>
                <Selo nivel="critico">sem MODEL</Selo>
                <small>Esta categoria não tem o atributo Modelo — só dá para mexer no título.</small>
              </>
            ) : modeloTravado ? (
              <>
                <Selo nivel="critico">bloqueado</Selo>
                <small>
                  Nesta categoria o Mercado Livre controla o Modelo; o vendedor não edita. Gravar
                  aqui vai voltar recusado.
                </small>
              </>
            ) : (
              <>
                <Selo nivel="atencao">lista fechada</Selo>
                <small>
                  Esta categoria só aceita modelos de uma lista própria ({modeloLista.length}{' '}
                  valores, ex.: {modeloLista.slice(0, 3).join(', ')}). Texto livre com
                  palavras-chave será recusado.
                </small>
              </>
            )}
          </p>
        ) : null}

        <div className="campo">
          <div className="rot">
            Modelo
            <div className="selos">
              <Contador usado={modelo.length} limite={limMod} />
            </div>
            <small className="selo mono" style={{ marginTop: 6 }}>
              MODEL
            </small>
          </div>
          <div className="ctrl" style={{ display: 'block' }}>
            <textarea
              ref={campoModelo}
              className="linha-unica"
              rows={2}
              value={modelo}
              maxLength={limMod}
              // Enter viraria quebra de linha, e o ML recusa quebra no atributo.
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.preventDefault();
              }}
              onChange={(e) => setModelo(e.target.value.replace(/\s*\n+\s*/g, ' '))}
            />
            {repModelo.length ? (
              <p style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0 0' }}>
                <Selo nivel="critico">repetida no modelo</Selo>
                {repModelo.map((p) => (
                  <Selo key={p} mono semIcone>
                    {p}
                  </Selo>
                ))}
              </p>
            ) : null}
            {repCruzada.length ? (
              <p style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0 0' }}>
                <Selo nivel="atencao">já está no título</Selo>
                {repCruzada.map((p) => (
                  <Selo key={p} mono semIcone>
                    {p}
                  </Selo>
                ))}
                <small>Cada uma dessas custa espaço sem trazer busca nova.</small>
              </p>
            ) : null}
          </div>
        </div>

        {r?.plano.modelo && montado ? (
          <>
            <div className="campo">
              <div className="rot">
                <Selo semIcone>sugestão</Selo>
                <div className="selos" style={{ marginTop: 6 }}>
                  <Contador usado={montado.valor.length} limite={limMod} />
                </div>
              </div>
              <div className="ctrl" style={{ display: 'block' }}>
                <p className="texto" style={{ marginTop: 0 }}>
                  {montado.valor}
                </p>

                {montado.usados.length ? (
                  <p style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '0 0 8px' }}>
                    {montado.usados.map((t) => (
                      <Selo key={t} nivel="bom">
                        {t}
                      </Selo>
                    ))}
                  </p>
                ) : null}

                {montado.repetidos.length ? (
                  <p style={{ margin: '0 0 8px' }}>
                    <small>Já cobertos pelo título, então fora daqui: </small>
                    {montado.repetidos.map((t) => (
                      <Selo key={t} semIcone>
                        {t}
                      </Selo>
                    ))}
                  </p>
                ) : null}

                {montado.sobraram.length ? (
                  <p style={{ margin: '0 0 8px' }}>
                    <small>Não coube no limite: </small>
                    {montado.sobraram.map((t) => (
                      <Selo key={t} nivel="atencao">
                        {t}
                      </Selo>
                    ))}
                  </p>
                ) : null}

                <p style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: 0 }}>
                  <button className="btn pequeno" onClick={() => trocarModelo(montado.valor)}>
                    Usar a sugestão
                  </button>
                  <button
                    className="btn pequeno"
                    onClick={() => trocarModelo(r.plano.modelo!.base)}
                    title="Só o modelo real, sem palavras-chave"
                  >
                    Só o modelo ({r.plano.modelo.base.length})
                  </button>
                </p>
              </div>
            </div>

            <p style={{ marginBottom: 0 }}>
              <small>{r.plano.modelo.motivo}</small>
              {r.plano.modelo.risco ? (
                <>
                  {' '}
                  <Selo nivel="atencao">risco</Selo> <small>{r.plano.modelo.risco}</small>
                </>
              ) : null}
            </p>
          </>
        ) : null}
      </section>

      {/* ---------- termos recusados, com resgate ---------- */}
      {r?.plano.descartados.length ? (
        <section className="card">
          <h2>Termos que descartei</h2>
          <p style={{ marginTop: 0 }}>
            <small>
              Estão nas listas de busca, mas na minha leitura descrevem outra coisa. Se algum deles
              serve, o botão joga direto no fim do campo Modelo — a palavra é sua, a leitura é
              minha.
            </small>
          </p>
          <div className="rolagem">
            <table className="tabela">
              <tbody>
                {r.plano.descartados.map((d) => {
                  const dentro = jaEntrou(d.termo);
                  return (
                    <tr key={d.termo} className={dentro ? 'usado' : undefined}>
                      <td className="rotulo">
                        {d.termo}
                        {dentro ? (
                          <>
                            {' '}
                            <Selo nivel="bom">no campo</Selo>
                          </>
                        ) : null}
                      </td>
                      <td>
                        <small>{d.motivo}</small>
                      </td>
                      <td style={{ width: 90, textAlign: 'right' }}>
                        <button
                          className="btn pequeno"
                          disabled={dentro}
                          onClick={() => juntarAoModelo(d.termo)}
                        >
                          {dentro ? 'já está' : 'Usar'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <div className="salvar">
        <button
          className="btn primary"
          disabled={
            !podeGravar ||
            publicando ||
            titulo.length > LIMITE_TITULO ||
            modelo.length > limMod ||
            (!mudouTitulo && !mudouModelo)
          }
          onClick={publicar}
        >
          {publicando ? 'Enviando…' : 'Publicar no ML'}
        </button>
        {aviso ? (
          aviso.ok ? (
            <Selo nivel="bom">{aviso.msg}</Selo>
          ) : (
            <span style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <Selo nivel="critico">recusado</Selo>
              <small style={{ maxWidth: 640 }}>{aviso.msg}</small>
            </span>
          )
        ) : (
          <small>
            {catalogo
              ? 'Anúncio de catálogo — o título é do catálogo do ML.'
              : podeGravar
                ? 'Título e modelo vão no mesmo PUT.'
                : 'Anúncio de outro vendedor — leitura apenas.'}
          </small>
        )}
      </div>
    </>
  );
}
