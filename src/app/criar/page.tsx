import { listarContas } from '@/lib/ml/client';
import { Secao } from '@/components/ui';
import CriarModos from './CriarModos';

export const dynamic = 'force-dynamic';

/**
 * Criação de anúncio — dois modos (plano 019 + plano 029):
 * - "Do catálogo": marca/modelo/código → produto de catálogo do ML → anúncio vinculado.
 * - "Fora do catálogo": produto sem PDP (lançamento, nicho) → o vendedor informa tudo.
 *
 * Fica fora do escopo "abrir anúncio existente" da home: aqui não há anúncio ainda. O seletor
 * de conta é próprio porque não há anúncio para descobrir de quem é — quem escolhe é você.
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

  return <CriarModos contas={contas} />;
}
