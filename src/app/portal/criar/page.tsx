import { redirect } from 'next/navigation';
import { supabaseServidor } from '@/lib/supabase/server';
import { conexoesDoClienteLogado } from '@/lib/portal/contaAtiva';
import { Secao } from '@/components/ui';
import CriarModos from '@/app/criar/CriarModos';

export const dynamic = 'force-dynamic';

/**
 * Criar anúncio pelo PORTAL do cliente (plano 034) — mesmo fluxo de `/criar` (planos 019/029–033),
 * mas operando na conta ML que o CLIENTE conectou (`contas_ml_clientes`, via `comContaCliente`),
 * não nas contas dos robôs. Os componentes são os mesmos; só o prefixo das rotas muda
 * (`base="/api/portal/anuncios"`).
 */
export default async function PortalCriarPage() {
  const supabase = await supabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/portal/login');

  const conexoes = await conexoesDoClienteLogado();

  if (conexoes.length === 0) {
    return (
      <>
        <h1>Criar anúncio</h1>
        <Secao titulo="Conecte uma conta do Mercado Livre primeiro">
          <p style={{ margin: 0 }}>
            Para criar anúncios pelo portal, conecte a conta do Mercado Livre em que eles vão
            nascer. É rápido e você pode desconectar quando quiser.
          </p>
          <p style={{ margin: '12px 0 0' }}>
            <a className="btn primary" href="/api/portal/ml/conectar">
              Conectar conta do Mercado Livre
            </a>{' '}
            <a className="btn" href="/portal/painel">
              Voltar ao painel
            </a>
          </p>
        </Secao>
      </>
    );
  }

  const contas = conexoes.map((c, i) => ({
    id: i + 1,
    seller_id: c.sellerId,
    apelido: c.apelido,
    org: null,
  }));

  return (
    <CriarModos
      contas={contas}
      base="/api/portal/anuncios"
      baseCatalogo="/api/portal/anuncios/catalogo"
      ferramentasInternas={false}
    />
  );
}
