'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Selo, Secao } from '@/components/ui';

type Conta = { id: number; seller_id: string; apelido: string | null; org: string | null };

type Tipo = 'diagnostico' | 'titulo' | 'descricao';

const TIPOS: { valor: Tipo; rotulo: string; nota: string }[] = [
  { valor: 'diagnostico', rotulo: 'Diagnóstico', nota: 'leitura do check-up completo' },
  { valor: 'titulo', rotulo: 'Título', nota: 'gera 1-3 títulos + sugestão de MODEL — não grava' },
  { valor: 'descricao', rotulo: 'Descrição', nota: 'gera uma descrição nova — não grava' },
];

/** Lê o motivo real de uma resposta de erro das rotas — o detalhe do ML vem em `body`. */
function descreverErro(json: unknown): string {
  try {
    const j = json as { erro?: string; body?: { message?: string } };
    const partes = [j?.erro, j?.body?.message].filter(Boolean) as string[];
    return partes.join(' — ') || 'Falhou e não explicou o motivo.';
  } catch {
    return 'Não consegui ler a resposta.';
  }
}

/** MLB123, links, e texto solto viram uma lista limpa de códigos únicos. */
function lerItemIds(bruto: string): string[] {
  const achados = bruto.match(/MLB-?\d{6,}/gi) ?? [];
  const limpos = achados.map((s) => s.toUpperCase().replace('MLB-', 'MLB'));
  return [...new Set(limpos)];
}

export default function CriarLote({
  contas,
  base = '/api/lote',
  rotaDetalhe = '/lote',
}: {
  contas: Conta[];
  /** Prefixo das rotas de lote. Admin: `/api/lote` (padrão). Portal: `/api/portal/lote`. */
  base?: string;
  /** Prefixo da PÁGINA de detalhe pra onde redirecionar após criar. Admin: `/lote` (padrão). Portal: `/portal/lote`. */
  rotaDetalhe?: string;
}) {
  const router = useRouter();
  const [sellerId, setSellerId] = useState(contas[0]?.seller_id ?? '');
  const [tipo, setTipo] = useState<Tipo>('diagnostico');
  const [texto, setTexto] = useState('');
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const itemIds = useMemo(() => lerItemIds(texto), [texto]);

  async function criar() {
    setCriando(true);
    setErro(null);
    try {
      const res = await fetch(base, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ seller_id: sellerId, item_ids: itemIds, tipo }),
      });
      const json = await res.json();
      if (!res.ok || !json?.lote_id) {
        setErro(descreverErro(json));
        return;
      }
      router.push(`${rotaDetalhe}/${json.lote_id}`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCriando(false);
    }
  }

  return (
    <Secao titulo="Novo lote">
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
          <div className="rot">Operação</div>
          <div className="ctrl">
            <select value={tipo} onChange={(e) => setTipo(e.target.value as Tipo)}>
              {TIPOS.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.rotulo} — {t.nota}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="campo" style={{ marginTop: 12 }}>
        <div className="rot">Anúncios (um por linha, ou cole os links)</div>
        <div className="ctrl">
          <textarea
            rows={8}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={'MLB1234567890\nMLB0987654321\nhttps://www.mercadolivre.com.br/…/p/MLB…'}
            style={{ width: '100%', fontFamily: 'inherit', resize: 'vertical' }}
          />
        </div>
      </div>

      <p style={{ margin: '10px 0 0', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Selo semIcone>{itemIds.length} anúncio{itemIds.length === 1 ? '' : 's'}</Selo>
        {tipo !== 'diagnostico' ? (
          <Selo nivel="atencao">só gera a proposta — a gravação continua manual, um a um</Selo>
        ) : null}
      </p>

      <p style={{ marginTop: 14 }}>
        <button
          className="btn primary"
          type="button"
          onClick={criar}
          disabled={criando || itemIds.length === 0 || !sellerId}
        >
          {criando ? 'Criando…' : 'Criar e acompanhar'}
        </button>
      </p>

      {erro ? (
        <p style={{ margin: 0 }}>
          <Selo nivel="critico">falhou</Selo> {erro}
        </p>
      ) : null}
    </Secao>
  );
}
