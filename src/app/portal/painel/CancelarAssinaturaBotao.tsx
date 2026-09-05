'use client';

import { useState } from 'react';

/** "Cancelar assinatura" (plano 037) — cancela no Mercado Pago e recarrega o painel. */
export default function CancelarAssinaturaBotao() {
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function cancelar() {
    if (!window.confirm('Cancelar a assinatura? Você mantém o acesso até o fim do período já pago.')) {
      return;
    }
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch('/api/portal/assinatura/cancelar', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        setErro(json?.erro ?? 'Não consegui cancelar.');
        return;
      }
      window.location.reload();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(false);
    }
  }

  return (
    <span style={{ marginLeft: 8 }}>
      <button className="btn pequeno" type="button" onClick={cancelar} disabled={carregando}>
        {carregando ? 'Cancelando…' : 'Cancelar assinatura'}
      </button>
      {erro ? (
        <span style={{ marginLeft: 8 }}>
          <small>{erro}</small>
        </span>
      ) : null}
    </span>
  );
}
