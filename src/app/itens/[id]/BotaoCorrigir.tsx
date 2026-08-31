'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function BotaoCorrigir({
  itemId,
  pictureId,
}: {
  itemId: string;
  pictureId: string;
}) {
  const router = useRouter();
  const [estado, setEstado] = useState<'parado' | 'indo' | 'ok' | 'erro'>('parado');
  const [msg, setMsg] = useState('');

  async function corrigir() {
    if (!confirm('Isso substitui a foto no anúncio publicado. Continuar?')) return;
    setEstado('indo');
    try {
      const res = await fetch(`/api/imagens/${itemId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ picture_id: pictureId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.body?.message ?? json.erro ?? `HTTP ${res.status}`);
      setEstado('ok');
      setMsg('trocada');
      router.refresh();
    } catch (e) {
      setEstado('erro');
      setMsg(e instanceof Error ? e.message : String(e));
    }
  }

  if (estado === 'ok') return <span className="selo bom"><span className="ic">✓</span>{msg}</span>;

  return (
    <>
      <button className="btn pequeno" onClick={corrigir} disabled={estado === 'indo'}>
        {estado === 'indo' ? 'Corrigindo…' : 'Deixar quadrada e branca'}
      </button>
      {estado === 'erro' ? <span className="selo critico"><span className="ic">×</span>{msg}</span> : null}
    </>
  );
}
