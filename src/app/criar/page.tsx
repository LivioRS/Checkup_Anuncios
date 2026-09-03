import { listarContas } from '@/lib/ml/client';
import { Secao } from '@/components/ui';
import CriarAnuncio from './CriarAnuncio';

export const dynamic = 'force-dynamic';

/**
 * Criação rápida de anúncio via catálogo (plano 019).
 *
 * Fica fora do escopo "abrir anúncio existente" da home: aqui não há anúncio
 * ainda, só um candidato de catálogo virando um. O seletor de conta é próprio
 * porque, ao contrário do resto do painel, não há anúncio para descobrir de
 * quem é — quem escolhe a conta é você.
 */
export default async function CriarPage() {
  let contas: { id: number; seller_id: string; apelido: string | null; org: string | null }[] = [];
  let falha: string | null = null;
  try {
    contas = await listarContas();
  } catch (e) {
    falha = e instanceof Error ? e.message : String(e);
  }

  if (falha) {
    return (
      <Secao titulo="Configuração incompleta">
        <p style={{ margin: 0 }}>{falha}</p>
        <small>Confira o .env.local e o acesso à tabela contas no Supabase.</small>
      </Secao>
    );
  }

  if (!contas.length) {
    return (
      <Secao titulo="Nenhuma conta com token">
        <p style={{ margin: 0 }}>
          A tabela <code>contas</code> não tem nenhuma linha com <code>access_token</code>. Sem
          conta cadastrada não há em nome de quem criar o anúncio.
        </p>
      </Secao>
    );
  }

  return (
    <>
      <h1>Criar anúncio via catálogo</h1>
      <p className="sub">
        Informe marca, modelo e (se tiver) o código do produto. Se ele estiver no catálogo do
        Mercado Livre, o anúncio sai em segundos — sempre como <strong>rascunho pausado</strong>,
        para alguém conferir antes de ativar.
      </p>
      <CriarAnuncio contas={contas} />
    </>
  );
}
