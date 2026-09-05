import { redirect } from 'next/navigation';
import { supabaseServidor } from '@/lib/supabase/server';
import { conexoesDoClienteLogado, clienteLogadoInfo } from '@/lib/portal/contaAtiva';
import { clienteLiberado } from '@/lib/portal/assinatura';
import { Secao } from '@/components/ui';
import CriarLote from '@/app/lote/CriarLote';
import AssinaturaBloqueio from '@/app/portal/AssinaturaBloqueio';

export const dynamic = 'force-dynamic';

/**
 * Criar lote pelo PORTAL do cliente (plano 035, f3c3) — mesmo fluxo de `/lote` (planos
 * 024–026), operando na conta ML que o CLIENTE conectou. Mesmo componente `CriarLote`; só o
 * prefixo das rotas muda (`base="/api/portal/lote"`).
 */
export default async function PortalLotePage() {
  const supabase = await supabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/portal/login');

  const info = await clienteLogadoInfo();
  if (info && !(await clienteLiberado(info.id, info.criadoEm))) {
    return <AssinaturaBloqueio titulo="Operação em lote" />;
  }

  const conexoes = await conexoesDoClienteLogado();

  if (conexoes.length === 0) {
    return (
      <>
        <h1>Operação em lote</h1>
        <Secao titulo="Conecte uma conta do Mercado Livre primeiro">
          <p style={{ margin: 0 }}>
            Para rodar diagnóstico/título/descrição em lote pelo portal, conecte a conta do
            Mercado Livre em que os anúncios estão.
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
    <>
      <h1>Operação em lote</h1>
      <p className="sub">
        Cole os códigos dos anúncios (um por linha), escolha a operação, e acompanhe o progresso
        na tela seguinte. Diagnóstico é leitura; título e descrição <strong>só geram a
        proposta</strong> — nada é gravado no anúncio.
      </p>
      <CriarLote contas={contas} base="/api/portal/lote" rotaDetalhe="/portal/lote" />
    </>
  );
}
