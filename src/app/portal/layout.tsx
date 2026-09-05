import { supabaseServidor } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Layout compartilhado de `/portal/*` (plano 037, acabamento do f3c5) — uma barra fina no topo
 * de TODA página do portal com o nome/logo da loja do cliente (`clientes.nome_loja`/`logo_url`)
 * e a navegação do portal. Best-effort: sem sessão (`/portal/login`, `/portal/cadastro`) mostra
 * só um rótulo neutro, sem nav.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  let logada = false;
  let nomeLoja: string | null = null;
  let logoUrl: string | null = null;

  try {
    const supabase = await supabaseServidor();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      logada = true;
      const { data } = await supabase.from('clientes').select('nome_loja, logo_url').limit(1);
      const c = data?.[0] as { nome_loja: string | null; logo_url: string | null } | undefined;
      nomeLoja = c?.nome_loja ?? null;
      logoUrl = c?.logo_url ?? null;
    }
  } catch {
    // sem sessão / sem cadastro — barra neutra
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          padding: '10px 0 12px',
          marginBottom: 16,
          borderBottom: '1px solid var(--borda, #e3e3e3)',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt=""
              width={24}
              height={24}
              style={{ objectFit: 'contain', borderRadius: 4 }}
            />
          ) : null}
          {nomeLoja || 'Portal do cliente'}
        </span>
        {logada ? (
          <nav style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <a href="/portal/painel">Painel</a>
            <a href="/portal/criar">Criar anúncio</a>
            <a href="/portal/lote">Lote</a>
          </nav>
        ) : null}
      </div>
      {children}
    </div>
  );
}
