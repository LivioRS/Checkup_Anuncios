'use client';

import { useState } from 'react';

/** Botão "Assinar agora" (plano 036, f3c6) — cria o preapproval e redireciona pro checkout hospedado do Mercado Pago. */
export default function AssinarBotao() {
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function assinar() {
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch('/api/portal/assinatura/iniciar', { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json?.init_point) {
        setErro(json?.erro ?? 'Não consegui iniciar a assinatura.');
        return;
      }
      window.location.href = json.init_point;
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      setCarregando(false);
    }
  }

  return (
    <p style={{ margin: '10px 0 0' }}>
      <button className="btn primary" type="button" onClick={assinar} disabled={carregando}>
        {carregando ? 'Abrindo o Mercado Pago…' : 'Assinar agora'}
      </button>
      {erro ? (
        <span style={{ marginLeft: 10 }}>
          <small>{erro}</small>
        </span>
      ) : null}
    </p>
  );
}
