'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';

/**
 * Cadastro do cliente do portal (plano 023, card f1c4) — self-service. Dois passos: 1)
 * `supabase.auth.signUp()` no browser cria o `auth.users` e (se a confirmação de e-mail
 * estiver desligada no projeto) já devolve sessão; 2) `/api/portal/completar-cadastro` grava a
 * linha em `clientes` com `service_role`, amarrada ao `auth_user_id` da sessão recém-criada.
 *
 * Se o projeto tiver confirmação de e-mail ligada, o passo 2 falha com 401 (sem sessão ainda) —
 * ver STOP conditions do plano 023. Fica documentado, não contornado às pressas aqui.
 */
export default function PortalCadastroPage() {
  const router = useRouter();
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);

    const supabase = supabaseBrowser();
    const { data, error } = await supabase.auth.signUp({ email, password: senha });
    if (error) {
      setEnviando(false);
      setErro(error.message);
      return;
    }
    if (!data.session) {
      setEnviando(false);
      setErro('Cadastro criado — confirme seu e-mail antes de entrar.');
      return;
    }

    const resp = await fetch('/api/portal/completar-cadastro', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nome }),
    });
    setEnviando(false);
    if (!resp.ok) {
      const json = await resp.json().catch(() => ({}));
      setErro(json?.erro ?? 'Falha ao concluir cadastro.');
      return;
    }

    router.push('/portal/painel');
    router.refresh();
  }

  return (
    <div className="card" style={{ maxWidth: 380, margin: '60px auto' }}>
      <h1>Criar conta</h1>
      <p className="sub">Cadastre-se para acompanhar seus anúncios no Mercado Livre.</p>
      <form onSubmit={onSubmit}>
        <input
          type="text"
          placeholder="Seu nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          autoFocus
          required
        />
        <input
          type="email"
          placeholder="E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ marginTop: 8 }}
          required
        />
        <input
          type="password"
          placeholder="Senha (mínimo 6 caracteres)"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          minLength={6}
          style={{ marginTop: 8 }}
          required
        />
        {erro ? (
          <p style={{ marginTop: 10 }}>
            <span className="selo critico"><span className="ic">×</span>{erro}</span>
          </p>
        ) : null}
        <button className="btn primary" style={{ marginTop: 12 }} type="submit" disabled={enviando}>
          {enviando ? 'Criando…' : 'Criar conta'}
        </button>
      </form>
      <p className="sub" style={{ marginTop: 16 }}>
        Já tem conta? <a href="/portal/login">Entrar</a>.
      </p>
    </div>
  );
}
