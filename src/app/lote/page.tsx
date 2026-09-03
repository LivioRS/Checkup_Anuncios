import { listarContas } from '@/lib/ml/client';
import { Secao } from '@/components/ui';
import CriarLote from './CriarLote';

export const dynamic = 'force-dynamic';

/**
 * Criar e acompanhar um lote (plano 026, card f2c3).
 *
 * Fecha o loop dos planos 024/025: até aqui o lote só existia via `curl`. Cola
 * uma lista de anúncios, escolhe a operação, e a tela seguinte
 * (`/lote/[id]`) faz o "tique-taque" sozinha até terminar.
 */
export default async function LotePage() {
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
          conta cadastrada não há em nome de quem rodar o lote.
        </p>
      </Secao>
    );
  }

  return (
    <>
      <h1>Operação em lote</h1>
      <p className="sub">
        Cole os códigos dos anúncios (um por linha), escolha a operação, e acompanhe o progresso na
        tela seguinte. Diagnóstico é leitura; título e descrição <strong>só geram a proposta</strong>
        {' '}— nada é gravado no anúncio.
      </p>
      <CriarLote contas={contas} />
    </>
  );
}
