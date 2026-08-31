'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { normalizeOut, type Field, type FieldGroup, type OutAttribute } from '@/lib/ml/model';
import { Selo } from '@/components/ui';

type Estado = { value_id: string | null; value_name: string | null; na: boolean };

function inicial(f: Field): Estado {
  return { value_id: f.current.value_id, value_name: f.current.value_name, na: f.isNA };
}

/** number_unit é enviado como "28 L": separamos número e unidade na edição. */
function splitUnit(value: string | null, units: { id: string; name: string }[], def?: string) {
  if (!value) return { num: '', unit: def ?? units[0]?.id ?? '' };
  const m = value.match(/^\s*([\d.,]+)\s*(.*)$/);
  if (!m) return { num: value, unit: def ?? units[0]?.id ?? '' };
  const u = units.find((x) => x.name === m[2] || x.id === m[2]);
  return { num: m[1], unit: u?.id ?? m[2] ?? def ?? '' };
}

export default function FichaForm({
  itemId,
  groups,
  podeGravar = true,
}: {
  itemId: string;
  groups: FieldGroup[];
  /** Falso quando o anúncio é de outro vendedor: a tela vira consulta. */
  podeGravar?: boolean;
}) {
  const router = useRouter();
  const campos = useMemo(() => groups.flatMap((g) => g.fields), [groups]);
  const base = useMemo(
    () => Object.fromEntries(campos.map((f) => [f.id, inicial(f)])) as Record<string, Estado>,
    [campos],
  );

  const [valores, setValores] = useState<Record<string, Estado>>(base);

  /**
   * Mantém o mapa de valores casado com os campos da tela.
   *
   * A lista de campos muda sem o componente remontar — é o que acontece ao
   * ligar "ver bloqueados e ocultos" ou ao recarregar o item depois de salvar.
   * Quando isso acontecia, os campos novos não tinham entrada em `valores`, e a
   * comparação estourava lendo propriedade de undefined.
   *
   * Aqui entram as chaves que faltam e saem as que não existem mais, PRESERVANDO
   * o que você já editou nos campos que continuam em tela.
   */
  useEffect(() => {
    setValores((atual) => {
      const ids = Object.keys(base);
      const mesmas =
        ids.length === Object.keys(atual).length && ids.every((id) => id in atual);
      if (mesmas) return atual;
      return Object.fromEntries(ids.map((id) => [id, atual[id] ?? base[id]]));
    });
  }, [base]);
  const [salvando, setSalvando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; msg: string } | null>(null);
  const [soFaltando, setSoFaltando] = useState(false);
  /** Atributos que o ML recusou no último envio — ficam marcados no formulário. */
  const [recusados, setRecusados] = useState<string[]>([]);

  const set = (id: string, patch: Partial<Estado>) => {
    setRecusados((r) => r.filter((x) => x !== id));
    setValores((v) => ({ ...v, [id]: { ...(v[id] ?? base[id]), ...patch } }));
  };

  /** Estado do campo, caindo no valor do anúncio se ainda não houver edição. */
  const estado = (id: string): Estado => valores[id] ?? base[id];

  const alterados = campos.filter((f) => {
    const a = base[f.id];
    const b = valores[f.id];
    // Sem um dos dois lados não há o que comparar — e não há alteração a enviar.
    if (!a || !b) return false;
    return a.value_id !== b.value_id || a.value_name !== b.value_name || a.na !== b.na;
  });

  /**
   * O ML não deixa apagar um atributo: uma vez preenchido, só dá para trocar o
   * valor ou marcar N/A. Mandar nulo volta como "invalid attribute values", e
   * junto vai por água abaixo todo o resto do PUT — ele é tudo ou nada.
   */
  const esvaziados = alterados.filter((f) => {
    const v = estado(f.id);
    const tinha = !!base[f.id].value_id || !!base[f.id].value_name || base[f.id].na;
    return tinha && !v.na && !v.value_id && !v.value_name;
  });

  const enviaveis = alterados.filter(
    (f) => !esvaziados.includes(f) && !recusados.includes(f.id),
  );

  async function salvar() {
    setSalvando(true);
    setResultado(null);
    const attributes: OutAttribute[] = enviaveis.map((f) => {
      const v = estado(f.id);
      if (v.na) return normalizeOut(f, { id: f.id, value_id: '-1' });
      return normalizeOut(f, { id: f.id, value_id: v.value_id, value_name: v.value_name });
    });

    try {
      const res = await fetch(`/api/itens/${itemId}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ attributes }),
      });
      const json = await res.json();
      if (!res.ok) {
        const culpados = culpadosDoErro(json, attributes.map((a) => a.id));
        setRecusados((r) => [...new Set([...r, ...culpados])]);
        setResultado({
          ok: false,
          msg: culpados.length
            ? `O ML recusou ${culpados.join(', ')}. Nada foi salvo — o PUT é tudo ou nada. Marquei o campo abaixo; corrija ou salve sem ele.`
            : formatarErro(json),
        });
      } else {
        setResultado({ ok: true, msg: `${attributes.length} atributo(s) atualizados no ML.` });
        setRecusados([]);
        router.refresh();
      }
    } catch (e) {
      setResultado({ ok: false, msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <div className="card plano" style={{ padding: '12px 22px' }}>
        <label className="na" style={{ fontSize: 14 }}>
          <input
            type="checkbox"
            checked={soFaltando}
            onChange={(e) => setSoFaltando(e.target.checked)}
          />
          Mostrar só o que falta
        </label>
      </div>

      {groups.map((g) => {
        const visiveis = g.fields.filter(
          (f) => !soFaltando || !(f.filled || estado(f.id)?.na || estado(f.id)?.value_name),
        );
        if (!visiveis.length) return null;
        return (
          <section className="card" key={g.id}>
            <h2>{g.label}</h2>
            {visiveis.map((f) => (
              <Campo
                key={f.id}
                f={f}
                v={estado(f.id)}
                recusado={recusados.includes(f.id)}
                // O MODEL é o campo que mais conversa com a busca: dali dá para
                // pular direto para a sugestão cruzada com as tendências.
                atalho={
                  f.id === 'MODEL' ? (
                    <Link className="btn pequeno" href={`/itens/${itemId}/titulo`}>
                      Sugerir com as buscas
                    </Link>
                  ) : null
                }
                onChange={(p) => set(f.id, p)}
              />
            ))}
          </section>
        );
      })}

      <div className="salvar">
        <button
          className="btn primary"
          disabled={!podeGravar || !enviaveis.length || salvando}
          onClick={salvar}
        >
          {salvando ? 'Enviando…' : `Salvar no ML (${enviaveis.length})`}
        </button>

        {/* Depois de preencher a ficha, o caminho natural é voltar ao check-up
            e ver a nota mudar — sem ter de rolar a página inteira de volta. */}
        <Link className="btn" href={`/itens/${itemId}`}>
          Voltar ao check-up
        </Link>
        {resultado ? (
          <Selo nivel={resultado.ok ? 'bom' : 'critico'}>{resultado.msg}</Selo>
        ) : (
          <small>
            {podeGravar
              ? 'Só os campos alterados são enviados no PUT.'
              : 'Anúncio de outro vendedor — leitura apenas.'}
          </small>
        )}
        {esvaziados.length ? (
          <small>
            {esvaziados.map((f) => f.name).join(', ')} {esvaziados.length > 1 ? 'ficaram' : 'ficou'}{' '}
            em branco e não {esvaziados.length > 1 ? 'vão' : 'vai'} no envio: o Mercado Livre não
            apaga atributo. Escolha outro valor ou marque N/A.
          </small>
        ) : null}
        {recusados.length ? (
          <small>Recusados pelo ML e fora do envio: {recusados.join(', ')}.</small>
        ) : null}
      </div>
    </>
  );
}

function Campo({
  f,
  v,
  recusado,
  atalho,
  onChange,
}: {
  f: Field;
  v: Estado;
  recusado?: boolean;
  atalho?: React.ReactNode;
  onChange: (p: Partial<Estado>) => void;
}) {
  const desabilitado = f.readOnly || v.na;

  return (
    <div className={`campo${f.readOnly ? ' travado' : ''}`}>
      <div className="rot">
        {f.name}
        <div className="selos">
          {f.required ? <Selo nivel="critico">obrigatório</Selo> : null}
          {!f.required && f.requiredForSpecs ? <Selo nivel="atencao">ficha</Selo> : null}
          {f.conditional ? <Selo nivel="atencao">condicional</Selo> : null}
          {f.filled ? <Selo nivel="bom">preenchido</Selo> : null}
          {f.hidden ? <Selo semIcone>oculto</Selo> : null}
          {f.readOnly ? <Selo semIcone>bloqueado · {f.readOnlyReason}</Selo> : null}
          {f.multivalued ? <Selo semIcone>vários</Selo> : null}
          {recusado ? <Selo nivel="critico">recusado pelo ML</Selo> : null}
        </div>
        <small className="selo mono" style={{ marginTop: 6 }}>{f.id}</small>
        {f.hint ? (
          <>
            <br />
            <small>{f.hint}</small>
          </>
        ) : null}
      </div>

      <div className="ctrl">
        {f.valueType === 'boolean' ? (
          <select
            value={v.value_id ?? ''}
            disabled={desabilitado}
            onChange={(e) => {
              const opt = f.values.find((o) => o.id === e.target.value);
              onChange({ value_id: e.target.value || null, value_name: opt?.name ?? null });
            }}
          >
            <option value="">—</option>
            {f.values.map((o) => (
              <option key={o.id ?? o.name} value={o.id ?? ''}>
                {o.name}
              </option>
            ))}
          </select>
        ) : f.valueType === 'list' ? (
          <>
            <select
              value={v.value_id ?? ''}
              disabled={desabilitado}
              onChange={(e) => {
                const opt = f.values.find((o) => o.id === e.target.value);
                onChange({ value_id: e.target.value || null, value_name: opt?.name ?? null });
              }}
            >
              <option value="">—</option>
              {f.values.map((o) => (
                <option key={o.id ?? o.name} value={o.id ?? ''}>
                  {o.name}
                </option>
              ))}
            </select>
            {f.allowCustomValue ? (
              <input
                type="text"
                placeholder="ou digite um valor fora da lista"
                disabled={desabilitado}
                value={v.value_id ? '' : (v.value_name ?? '')}
                maxLength={f.maxLength}
                onChange={(e) => onChange({ value_id: null, value_name: e.target.value || null })}
              />
            ) : null}
          </>
        ) : f.valueType === 'number_unit' ? (
          <NumberUnit f={f} v={v} onChange={onChange} disabled={desabilitado} />
        ) : (
          <>
            <input
              type={f.valueType === 'number' ? 'number' : 'text'}
              disabled={desabilitado}
              value={v.value_name ?? ''}
              maxLength={f.maxLength}
              list={f.suggested.length ? `sug-${f.id}` : undefined}
              onChange={(e) => onChange({ value_id: null, value_name: e.target.value || null })}
            />
            {f.suggested.length ? (
              <datalist id={`sug-${f.id}`}>
                {f.suggested.map((s) => (
                  <option key={s.id ?? s.name} value={s.name ?? ''} />
                ))}
              </datalist>
            ) : null}
          </>
        )}

        {atalho}

        {!f.readOnly && !f.required ? (
          <label className="na">
            <input
              type="checkbox"
              checked={v.na}
              onChange={(e) => onChange({ na: e.target.checked })}
            />
            N/A
          </label>
        ) : null}
      </div>
    </div>
  );
}

function NumberUnit({
  f,
  v,
  onChange,
  disabled,
}: {
  f: Field;
  v: Estado;
  onChange: (p: Partial<Estado>) => void;
  disabled: boolean;
}) {
  const { num, unit } = splitUnit(v.value_name, f.allowedUnits, f.defaultUnit);
  const emit = (n: string, u: string) =>
    onChange({ value_id: null, value_name: n ? `${n} ${u}`.trim() : null });

  return (
    <>
      <input
        type="text"
        inputMode="decimal"
        placeholder="valor"
        disabled={disabled}
        value={num}
        onChange={(e) => emit(e.target.value, unit)}
      />
      <select disabled={disabled} value={unit} onChange={(e) => emit(num, e.target.value)}>
        {f.allowedUnits.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
    </>
  );
}

/**
 * Descobre quais atributos o ML apontou no erro.
 *
 * A mensagem vem como "GRADING has invalid attribute values" — o id aparece no
 * texto, não num campo próprio. Em vez de tentar adivinhar o formato, procuramos
 * no texto os ids que ACABAMOS de enviar: se está lá, é dele que o ML fala.
 */
function culpadosDoErro(json: unknown, enviados: string[]): string[] {
  const j = json as { body?: { message?: string; cause?: unknown[] } };
  const texto = [j?.body?.message, JSON.stringify(j?.body?.cause ?? [])]
    .filter(Boolean)
    .join(' ');
  if (!texto) return [];
  return enviados.filter((id) => new RegExp(`\\b${id}\\b`).test(texto));
}

function formatarErro(json: unknown): string {
  const j = json as { erro?: string; body?: { message?: string; cause?: unknown[] } };
  const partes: string[] = [];
  if (j?.body?.message) partes.push(j.body.message);
  if (Array.isArray(j?.body?.cause)) {
    for (const c of j.body!.cause as { code?: string; message?: string }[]) {
      partes.push(`${c.code ?? ''} ${c.message ?? ''}`.trim());
    }
  }
  if (!partes.length && j?.erro) partes.push(j.erro);
  return partes.join(' · ').slice(0, 400) || 'Erro desconhecido';
}
