'use client';

import { useState } from 'react';
import CriarAnuncio from './CriarAnuncio';
import CriarAvulso from './CriarAvulso';

type Conta = { id: number; seller_id: string; apelido: string | null; org: string | null };

type Modo = 'catalogo' | 'avulso';
type Prefill = { sellerId?: string; marca?: string; modelo?: string; codigo?: string };

/**
 * Alterna entre criar anúncio do catálogo (plano 019) e fora do catálogo (plano 029).
 * Plano 033: o "Fora do catálogo" pode empurrar o Livio pro "Do catálogo" quando o GTIN mostra
 * que o produto já tem página no ML — levando marca/modelo/código junto.
 */
export default function CriarModos({
  contas,
  base = '/api/anuncios',
  baseCatalogo = '/api/catalogo',
  ferramentasInternas = true,
}: {
  contas: Conta[];
  /** Prefixo das rotas de criação. Admin: `/api/anuncios` (padrão). Portal: `/api/portal/anuncios`. */
  base?: string;
  /** Prefixo da busca de catálogo. Admin: `/api/catalogo` (padrão). Portal: `/api/portal/anuncios/catalogo`. */
  baseCatalogo?: string;
  /** Liga links de telas só-admin (`/itens/*`). O portal passa `false`. */
  ferramentasInternas?: boolean;
}) {
  const [modo, setModo] = useState<Modo>('catalogo');
  const [prefill, setPrefill] = useState<Prefill | null>(null);

  function trocarParaCatalogo(dados: Prefill) {
    setPrefill(dados);
    setModo('catalogo');
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <>
      <h1>Criar anúncio</h1>
      <p className="sub">
        {modo === 'catalogo'
          ? 'Do catálogo: informe marca, modelo e (se tiver) o código. Se o produto estiver no catálogo do Mercado Livre, o anúncio sai em segundos.'
          : 'Fora do catálogo: para produto sem página no Mercado Livre (lançamento, nicho). Você informa título, categoria, ficha e fotos.'}{' '}
        Sempre nasce como <strong>rascunho pausado</strong> — alguém confere e ativa manualmente.
      </p>

      <div className="card" style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          type="button"
          className={`btn${modo === 'catalogo' ? ' primary' : ''}`}
          onClick={() => setModo('catalogo')}
        >
          Do catálogo
        </button>
        <button
          type="button"
          className={`btn${modo === 'avulso' ? ' primary' : ''}`}
          onClick={() => {
            setPrefill(null);
            setModo('avulso');
          }}
        >
          Fora do catálogo
        </button>
      </div>

      {modo === 'catalogo' ? (
        <CriarAnuncio
          key={prefill ? `${prefill.marca}|${prefill.modelo}|${prefill.codigo}` : 'vazio'}
          contas={contas}
          prefill={prefill ?? undefined}
          base={base}
          baseCatalogo={baseCatalogo}
        />
      ) : (
        <CriarAvulso
          contas={contas}
          onTrocarParaCatalogo={trocarParaCatalogo}
          base={base}
          ferramentasInternas={ferramentasInternas}
        />
      )}
    </>
  );
}
