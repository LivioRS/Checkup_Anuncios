'use client';

import { useState } from 'react';
import CriarAnuncio from './CriarAnuncio';
import CriarAvulso from './CriarAvulso';

type Conta = { id: number; seller_id: string; apelido: string | null; org: string | null };

type Modo = 'catalogo' | 'avulso';

/** Alterna entre criar anúncio do catálogo (plano 019) e fora do catálogo (plano 029). */
export default function CriarModos({ contas }: { contas: Conta[] }) {
  const [modo, setModo] = useState<Modo>('catalogo');

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
          onClick={() => setModo('avulso')}
        >
          Fora do catálogo
        </button>
      </div>

      {modo === 'catalogo' ? <CriarAnuncio contas={contas} /> : <CriarAvulso contas={contas} />}
    </>
  );
}
