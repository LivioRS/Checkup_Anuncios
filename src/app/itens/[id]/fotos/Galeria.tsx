'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Anel, Selo, nivelPorNota } from '@/components/ui';

export type Foto = {
  id: string;
  url: string;
  size?: string; // "1200x1200", como o ML devolve
  max_size?: string;
  /** O ML devolve esse campo na prática, mas ele não está na documentação. */
  quality?: number | string;
};

/**
 * Qualidade de 0 a 100. Preferimos o número do próprio ML; se ele não vier,
 * calculamos o aproveitamento de tamanho (maior lado ÷ 1200) e a tela diz
 * claramente que a conta é nossa, não do Mercado Livre.
 */
function qualidade(f: Foto): { valor: number; doML: boolean } | null {
  const q = typeof f.quality === 'string' ? Number(f.quality.replace(',', '.')) : f.quality;
  if (typeof q === 'number' && Number.isFinite(q) && q > 0) {
    return { valor: q <= 1 ? Math.round(q * 100) : Math.round(q), doML: true };
  }
  const m = medidas(f.max_size) ?? medidas(f.size);
  if (!m) return null;
  return { valor: Math.min(100, Math.round((Math.max(m.l, m.a) / 1200) * 100)), doML: false };
}

const FAIXAS = [
  { ate: 100, rotulo: 'excelentes', min: 95, nivel: 'bom' as const },
  { ate: 94, rotulo: 'boas', min: 80, nivel: 'bom' as const },
  { ate: 79, rotulo: 'medianas', min: 50, nivel: 'atencao' as const },
  { ate: 49, rotulo: 'ruins', min: 0, nivel: 'critico' as const },
];

function faixaDe(v: number) {
  return FAIXAS.find((f) => v >= f.min) ?? FAIXAS[FAIXAS.length - 1];
}

type Diagnostico = { picture_id: string; problemas: string[]; nomes: string[]; erro?: string };

/** "1200x900" -> { l: 1200, a: 900 } */
function medidas(s?: string) {
  const m = (s ?? '').match(/^(\d+)\s*x\s*(\d+)$/i);
  return m ? { l: Number(m[1]), a: Number(m[2]) } : null;
}

/**
 * Julga SÓ o tamanho. Proporção não entra aqui: foto de ambiente, de detalhe e
 * de uso não precisam ser quadradas, e forçar isso estragaria o anúncio.
 * Fundo branco também não é avaliado aqui — quem decide é o ML, por categoria,
 * e só para a capa.
 */
function avaliarTamanho(f: Foto) {
  const m = medidas(f.max_size) ?? medidas(f.size);
  if (!m) return { nivel: 'neutro' as const, texto: 'tamanho desconhecido', precisa: false };
  const maior = Math.max(m.l, m.a);
  const menor = Math.min(m.l, m.a);
  if (menor < 500)
    return { nivel: 'critico' as const, texto: `${m.l}×${m.a} — abaixo do mínimo`, precisa: true };
  if (maior < 1200)
    return { nivel: 'atencao' as const, texto: `${m.l}×${m.a} — abaixo do ideal`, precisa: true };
  if (maior > 1920)
    return { nivel: 'atencao' as const, texto: `${m.l}×${m.a} — acima do máximo`, precisa: true };
  return { nivel: 'bom' as const, texto: `${m.l}×${m.a}`, precisa: false };
}

const LIMITE = 95; // abaixo disso o lote reenvia a foto

export default function Galeria({ itemId, fotos }: { itemId: string; fotos: Foto[] }) {
  const router = useRouter();
  const [i, setI] = useState(0);
  const [diag, setDiag] = useState<Record<string, Diagnostico> | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; msg: string } | null>(null);
  const [progresso, setProgresso] = useState(0);

  if (!fotos.length) {
    return (
      <section className="card">
        <p className="vazio" style={{ margin: 0 }}>
          Este anúncio não tem fotos.
        </p>
      </section>
    );
  }

  const atual = fotos[Math.min(i, fotos.length - 1)];
  const tam = avaliarTamanho(atual);
  const dAtual = diag?.[atual.id];
  const ehCapa = i === 0;
  // O fundo branco só é oferecido quando o PRÓPRIO ML apontou na capa.
  const precisaFundoBranco = !!dAtual?.nomes?.includes('white_background');

  async function diagnosticar() {
    setOcupado('diag');
    setAviso(null);
    try {
      const res = await fetch(`/api/imagens/${itemId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.erro ?? `HTTP ${res.status}`);
      const mapa: Record<string, Diagnostico> = {};
      for (const f of json.fotos as Diagnostico[]) mapa[f.picture_id] = f;
      setDiag(mapa);
    } catch (e) {
      setAviso({ ok: false, msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setOcupado(null);
    }
  }

  async function corrigir(pictureId: string, modo: 'proporcional' | 'quadrado') {
    const aviso =
      modo === 'quadrado'
        ? 'Isso põe a capa sobre um quadrado branco e substitui a foto publicada. Continuar?'
        : 'Isso substitui a foto no anúncio publicado, mudando só a escala. Continuar?';
    if (!confirm(aviso)) return;
    setOcupado(pictureId);
    setAviso(null);
    try {
      const res = await fetch(`/api/imagens/${itemId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ picture_id: pictureId, modo }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.body?.message ?? json.erro ?? `HTTP ${res.status}`);
      setAviso({ ok: true, msg: `Trocada: ${json.antes} → ${json.depois}` });
      setDiag(null);
      router.refresh();
    } catch (e) {
      setAviso({ ok: false, msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setOcupado(null);
    }
  }

  const precisamCorrecao = fotos.filter((f) => avaliarTamanho(f).precisa);

  const quals = fotos.map((f) => qualidade(f));
  const comQual = quals.filter(Boolean) as { valor: number; doML: boolean }[];
  const media = comQual.length
    ? Math.round(comQual.reduce((s2, q) => s2 + q.valor, 0) / comQual.length)
    : null;
  const algumDoML = comQual.some((q) => q.doML);
  const contagem = FAIXAS.map((f) => ({
    ...f,
    n: comQual.filter((q) => faixaDe(q.valor).rotulo === f.rotulo).length,
  }));
  const abaixoDoCorte = fotos.filter((f, n) => (quals[n]?.valor ?? 100) < LIMITE);

  async function corrigirLote() {
    if (!abaixoDoCorte.length) return;
    if (
      !confirm(
        `Isso vai substituir ${abaixoDoCorte.length} foto(s) no anúncio publicado, uma por vez. Continuar?`,
      )
    )
      return;
    setOcupado('lote');
    setAviso(null);
    let feitas = 0;
    for (const f of abaixoDoCorte) {
      try {
        const res = await fetch(`/api/imagens/${itemId}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ picture_id: f.id, modo: 'proporcional' }),
        });
        if (res.ok) feitas++;
      } catch {
        /* segue para a próxima */
      }
      setProgresso(feitas);
    }
    setOcupado(null);
    setProgresso(0);
    setAviso({ ok: feitas > 0, msg: `${feitas} de ${abaixoDoCorte.length} foto(s) atualizadas.` });
    setDiag(null);
    router.refresh();
  }

  return (
    <>
      <div className="card">
        <div className="visor">
          <button
            className="seta"
            onClick={() => setI((n) => (n - 1 + fotos.length) % fotos.length)}
            aria-label="Foto anterior"
          >
            ‹
          </button>

          <div className="palco">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={atual.url} alt={`Foto ${i + 1} de ${fotos.length}`} />
          </div>

          <button
            className="seta"
            onClick={() => setI((n) => (n + 1) % fotos.length)}
            aria-label="Próxima foto"
          >
            ›
          </button>
        </div>

        <div className="tira">
          {fotos.map((f, n) => {
            const t = avaliarTamanho(f);
            return (
              <button
                key={f.id}
                className={`mini${n === i ? ' ativa' : ''}`}
                onClick={() => setI(n)}
                title={t.texto}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt="" />
                {t.precisa ? <span className="marca" aria-hidden="true" /> : null}
                <span className="ordem">{n + 1}</span>
              </button>
            );
          })}
        </div>
      </div>

      <section className="card">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: '1 1 260px' }}>
            <h2 style={{ marginBottom: 8 }}>
              Foto {i + 1} de {fotos.length}
              {i === 0 ? ' · capa' : ''}
            </h2>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              <Selo nivel={tam.nivel === 'neutro' ? 'neutro' : tam.nivel}>{tam.texto}</Selo>
              {dAtual ? (
                dAtual.erro ? (
                  <Selo nivel="atencao">não avaliada</Selo>
                ) : dAtual.problemas.length ? (
                  dAtual.problemas.map((p, n) => (
                    <Selo key={n} nivel="critico">
                      {p}
                    </Selo>
                  ))
                ) : (
                  <Selo nivel="bom">sem apontamentos do ML</Selo>
                )
              ) : null}
              <Selo mono semIcone>
                {atual.id}
              </Selo>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn" onClick={diagnosticar} disabled={ocupado !== null}>
              {ocupado === 'diag' ? 'Analisando…' : 'Analisar todas no ML'}
            </button>
            <button
              className="btn primary"
              onClick={() => corrigir(atual.id, 'proporcional')}
              disabled={ocupado !== null || !tam.precisa}
              title={
                tam.precisa
                  ? 'Reamostra para 1200 no maior lado, mantendo a proporção'
                  : 'O tamanho desta foto já está no padrão'
              }
            >
              {ocupado === atual.id ? 'Enviando…' : 'Redimensionar para 1200'}
            </button>
            {ehCapa && precisaFundoBranco ? (
              <button
                className="btn"
                onClick={() => corrigir(atual.id, 'quadrado')}
                disabled={ocupado !== null}
              >
                Quadrado com fundo branco
              </button>
            ) : null}
          </div>
        </div>

        {aviso ? (
          <p style={{ margin: '12px 0 0' }}>
            <Selo nivel={aviso.ok ? 'bom' : 'critico'}>{aviso.msg}</Selo>
          </p>
        ) : null}

        <p style={{ margin: '14px 0 0' }}>
          <small>
            <strong>Redimensionar</strong> só reescala a sua própria foto para 1200 no maior lado,
            mantendo a proporção — não acrescenta nada à imagem.{' '}
            <strong>Quadrado com fundo branco</strong> aparece apenas na capa, e apenas quando o
            próprio Mercado Livre apontar que a categoria exige — nas outras fotos o painel nunca
            mexe no fundo, porque barra branca estraga foto de ambiente e de detalhe.
            <br />
            Texto na imagem, logo e marca d&apos;água o ML aponta, mas corrigir exigiria redesenhar
            a foto. Isso é refotografar ou editar, não automatizar.
            {precisamCorrecao.length ? (
              <>
                {' '}
                Neste anúncio, <strong>{precisamCorrecao.length}</strong> de {fotos.length} fotos
                estão fora do tamanho.
              </>
            ) : (
              ' Todas as fotos deste anúncio já estão no tamanho certo.'
            )}
            {ehCapa && dAtual && !precisaFundoBranco ? (
              <>
                {' '}
                Nesta categoria, o ML <strong>não</strong> apontou fundo branco para a capa.
              </>
            ) : null}
          </small>
        </p>
      </section>

      <section className="card">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14 }}>
          <h2 style={{ margin: 0 }}>Qualidade das imagens</h2>
          <div style={{ marginLeft: 'auto' }}>
            <button
              className="btn pequeno"
              onClick={corrigirLote}
              disabled={ocupado !== null || !abaixoDoCorte.length}
            >
              {ocupado === 'lote'
                ? `Corrigindo ${progresso}/${abaixoDoCorte.length}…`
                : `Corrigir as ${abaixoDoCorte.length} abaixo de ${LIMITE}%`}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'center' }}>
          {media !== null ? (
            <Anel
              valor={media}
              nivel={nivelPorNota(media)}
              legenda="Média das fotos"
              detalhe={<small>{algumDoML ? 'qualidade informada pelo ML' : 'aproveitamento de tamanho, calculado aqui'}</small>}
            />
          ) : null}

          <div style={{ flex: '1 1 220px' }}>
            {contagem.map((f) => (
              <div key={f.rotulo} className="faixa">
                <strong>{f.n}</strong>
                <span>imagens {f.rotulo}</span>
                <i className={f.nivel} style={{ width: `${fotos.length ? (f.n / fotos.length) * 100 : 0}%` }} />
              </div>
            ))}
            <div className="faixa total">
              <strong>{fotos.length}</strong>
              <span>total de imagens</span>
            </div>
          </div>

          <div className="rolagem" style={{ flex: '1 1 280px' }}>
            <table className="tabela">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  <th>Tamanho máx.</th>
                  <th style={{ width: 110 }}>Qualidade</th>
                </tr>
              </thead>
              <tbody>
                {fotos.map((f, n) => {
                  const q = quals[n];
                  return (
                    <tr key={f.id}>
                      <td>{n + 1}</td>
                      <td>{f.max_size ?? f.size ?? '—'}</td>
                      <td>
                        {q ? (
                          <Selo nivel={faixaDe(q.valor).nivel}>{q.valor}%</Selo>
                        ) : (
                          <Selo semIcone>—</Selo>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <p style={{ margin: '14px 0 0' }}>
          <small>
            {algumDoML
              ? 'O percentual vem do campo de qualidade que a própria API do Mercado Livre devolve para cada foto.'
              : 'A API não devolveu qualidade para estas fotos, então o percentual é o aproveitamento de tamanho calculado aqui (maior lado ÷ 1200). É uma aproximação, não o número do ML.'}{' '}
            Corrigir em lote reenvia só as fotos abaixo de {LIMITE}%, uma por vez, sempre com
            redimensionamento proporcional — nunca com fundo branco.
          </small>
        </p>
      </section>

      {tam.precisa && medidas(atual.max_size ?? atual.size) &&
      Math.max(
        medidas(atual.max_size ?? atual.size)!.l,
        medidas(atual.max_size ?? atual.size)!.a,
      ) < 900 ? (
        <section className="card">
          <p style={{ margin: 0 }}>
            <Selo nivel="atencao">ampliação não cria detalhe</Selo>{' '}
            <small>
              Esta foto é pequena demais. Esticar para 1200 faz o ML parar de reclamar do tamanho,
              mas não devolve nitidez que a imagem não tem. Se existir o arquivo original em
              resolução maior, use ele. Se não, o certo é refotografar.
            </small>
          </p>
        </section>
      ) : null}

      <style>{`
        .visor { display: flex; align-items: center; gap: 12px; }
        .palco {
          flex: 1;
          background: #fff;
          border: 1px solid var(--linha);
          border-radius: var(--r-md);
          aspect-ratio: 1;
          max-height: 460px;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }
        .palco img { max-width: 100%; max-height: 100%; object-fit: contain; }
        .seta {
          flex: 0 0 auto;
          width: 38px; height: 62px;
          border: 1px solid var(--linha-forte);
          background: var(--superficie);
          color: var(--tinta-2);
          border-radius: 999px;
          font-size: 22px; line-height: 1;
          cursor: pointer;
        }
        .seta:hover { background: var(--superficie-2); color: var(--tinta); }
        .tira {
          display: flex; gap: 10px; margin-top: 14px;
          overflow-x: auto; padding-bottom: 4px;
        }
        .mini {
          position: relative;
          flex: 0 0 76px; width: 76px; height: 76px;
          padding: 0; cursor: pointer;
          border: 2px solid var(--linha);
          border-radius: var(--r-sm);
          background: #fff; overflow: hidden;
        }
        .mini.ativa { border-color: var(--acento); }
        .mini img { width: 100%; height: 100%; object-fit: contain; }
        .mini .marca {
          position: absolute; top: 4px; right: 4px;
          width: 9px; height: 9px; border-radius: 50%;
          background: var(--atencao); border: 1px solid #fff;
        }
        .mini .ordem {
          position: absolute; left: 3px; bottom: 3px;
          font-size: 10px; font-weight: 600;
          background: rgba(0,0,0,.55); color: #fff;
          border-radius: 4px; padding: 0 4px;
        }
      `}</style>
    </>
  );
}
