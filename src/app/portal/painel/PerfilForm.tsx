'use client';

import { useState } from 'react';

/** Nome/logo da loja no portal (plano 036, f3c5 — branding simples). */
export default function PerfilForm({
  nomeLojaInicial,
  logoUrlInicial,
}: {
  nomeLojaInicial: string | null;
  logoUrlInicial: string | null;
}) {
  const [nomeLoja, setNomeLoja] = useState(nomeLojaInicial ?? '');
  const [logoUrl, setLogoUrl] = useState(logoUrlInicial ?? '');
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  async function salvar() {
    setSalvando(true);
    setMsg(null);
    try {
      const res = await fetch('/api/portal/perfil', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nome_loja: nomeLoja, logo_url: logoUrl }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMsg({ ok: false, texto: json?.erro ?? 'Falhou ao salvar.' });
        return;
      }
      setMsg({ ok: true, texto: 'Salvo.' });
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof Error ? e.message : String(e) });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="grid k2">
      <div className="campo">
        <div className="rot">Nome da loja</div>
        <div className="ctrl">
          <input
            type="text"
            value={nomeLoja}
            onChange={(e) => setNomeLoja(e.target.value)}
            maxLength={80}
            placeholder="Sua loja"
          />
        </div>
      </div>
      <div className="campo">
        <div className="rot">URL do logo (opcional)</div>
        <div className="ctrl">
          <input
            type="text"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://…/logo.png"
          />
        </div>
      </div>
      <p style={{ gridColumn: '1 / -1', margin: '6px 0 0' }}>
        <button className="btn pequeno" type="button" onClick={salvar} disabled={salvando}>
          {salvando ? 'Salvando…' : 'Salvar'}
        </button>
        {msg ? (
          <span style={{ marginLeft: 10 }}>
            <small>{msg.texto}</small>
          </span>
        ) : null}
      </p>
    </div>
  );
}
