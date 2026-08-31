export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; erro?: string }>;
}) {
  const sp = await searchParams;
  return (
    <div className="card" style={{ maxWidth: 380, margin: '60px auto' }}>
      <h1>Entrar no painel</h1>
      <p className="sub">Este painel guarda os tokens da sua conta do Mercado Livre.</p>
      <form method="post" action="/api/panel-login">
        <input type="hidden" name="next" value={sp.next ?? '/'} />
        <input type="password" name="senha" placeholder="Senha do painel" autoFocus />
        {sp.erro ? (
          <p style={{ marginTop: 10 }}>
            <span className="selo critico"><span className="ic">×</span>Senha incorreta</span>
          </p>
        ) : null}
        <button className="btn primary" style={{ marginTop: 12 }} type="submit">
          Entrar
        </button>
      </form>
    </div>
  );
}
