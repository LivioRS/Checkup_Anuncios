'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';

/**
 * Login do cliente do portal (plano 023, card f1c4) — namespace `/portal/*`, sem relação com o
 * `PANEL_PASSWORD` do painel administrativo (`/login`). Sessão via Supabase Auth, cookies
 * geridos por `@supabase/ssr`.
 */
export default function PortalLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    setEnviando(false);
    if (error) {
      setErro('E-mail ou senha incorretos.');
      return;
    }
    router.push('/portal/painel');
    router.refresh();
  }

  return (
    <div className="card" style={{ maxWidth: 380, margin: '60px auto' }}>
      <h1>Entrar</h1>
      <p className="sub">Acesse sua conta do portal de check-up de anúncios.</p>
      <form onSubmit={onSubmit}>
        <input
          type="email"
          placeholder="E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoFocus
          required
        />
        <input
          type="password"
          placeholder="Senha"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          style={{ marginTop: 8 }}
          required
        />
        {erro ? (
          <p style={{ marginTop: 10 }}>
            <span className="selo critico"><span className="ic">×</span>{erro}</span>
          </p>
        ) : null}
        <button className="btn primary" style={{ marginTop: 12 }} type="submit" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
      <p className="sub" style={{ marginTop: 16 }}>
        Ainda não tem conta? <a href="/portal/cadastro">Cadastre-se</a>.
      </p>
    </div>
  );
}
