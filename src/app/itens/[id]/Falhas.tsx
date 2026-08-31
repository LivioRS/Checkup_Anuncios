import Link from 'next/link';
import { Selo } from '@/components/ui';
import { MlError } from '@/lib/ml/client';
import { SemAcesso, conferirTokens } from '@/lib/ml/dono';
import { ehProdutoDeCatalogo } from '@/lib/ml/catalogo';

/**
 * Tela de falha compartilhada pelo check-up e pela ficha.
 *
 * São três desfechos bem diferentes e cada um pede uma resposta própria:
 * o ML barrou (403/401), o código é de um produto de catálogo e não de um
 * anúncio, ou deu outra coisa. Mostrar "erro" seco nos três casos esconde
 * justamente a informação que resolve.
 */
export default async function PainelDeFalha({ id, erro }: { id: string; erro: unknown }) {
  const barrado =
    erro instanceof SemAcesso ||
    (erro instanceof MlError && (erro.status === 403 || erro.status === 401));

  if (barrado) {
    const tokens = await conferirTokens().catch(() => []);
    // Se todo token confere, o problema NÃO é de cadastro: o anúncio é de
    // outro vendedor e o ML simplesmente não libera este por API. Dizer a
    // coisa certa aqui evita horas procurando defeito onde não há.
    const tudoConfere = tokens.length > 0 && tokens.every((t) => t.confere);

    return (
      <>
        <Voltar />
        <h1>{tudoConfere ? 'O Mercado Livre não libera este anúncio' : 'Sem acesso a este anúncio'}</h1>
        <p className="sub" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <Selo mono semIcone>
            {id}
          </Selo>
          <Selo nivel="atencao">403 do Mercado Livre</Selo>
          <a href={linkPublico(id)} target="_blank" rel="noreferrer">
            abrir no site ↗
          </a>
        </p>

        {tudoConfere ? (
          <section className="card">
            <p style={{ marginTop: 0 }}>
              Seus tokens estão todos certos — conferi um por um. Este anúncio é de outro vendedor,
              e a API do ML não entrega todo anúncio de terceiro: parte dela responde só para o
              token do dono.
            </p>
            <p>
              <small>
                Tentei três caminhos: a conta padrão, cada uma das outras contas cadastradas, e o
                multiget <code>/items?ids=</code>, que às vezes devolve o que é público quando o
                <code>/items/{'{'}id{'}'}</code> recusa. Os três foram negados, então não há de onde
                tirar os dados deste aqui.
              </small>
            </p>
            <p style={{ marginBottom: 0 }}>
              <small>
                Anúncio de concorrente costuma abrir — a maioria abre. Quando não abre, geralmente é
                anúncio pausado, encerrado, em revisão, ou de uma modalidade que o ML fecha para
                fora. Vale tentar outro do mesmo vendedor para confirmar que é este anúncio, e não
                a conta dele.
              </small>
            </p>
          </section>
        ) : (
          <section className="card">
            <p style={{ marginTop: 0 }}>
              O Mercado Livre recusou a leitura deste anúncio.
              {erro instanceof SemAcesso ? (
                <>
                  {' '}
                  Tentei com todas as contas cadastradas —{' '}
                  <strong>{erro.contasTentadas.join(', ')}</strong> — e nenhuma teve acesso.
                </>
              ) : null}
            </p>
            <p style={{ marginBottom: 0 }}>
              <small>
                A API só entrega o anúncio para o token da conta dona. Na tabela abaixo, uma linha
                marcada em vermelho quer dizer que o token guardado é de outra conta — esse é o
                defeito a corrigir, reautorizando aquela conta.
              </small>
            </p>
          </section>
        )}

        <section className="card">
          <h2>Conferência dos tokens</h2>
          <p style={{ marginTop: 0 }}>
            <small>
              Cada linha da tabela <code>contas</code>, checada agora contra o{' '}
              <code>/users/me</code>: o token guardado pertence mesmo àquele seller_id?
            </small>
          </p>

          {tokens.length ? (
            <div className="rolagem">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Linha em contas</th>
                    <th>seller_id</th>
                    <th>Token pertence a</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {tokens.map((t) => (
                    <tr key={t.sellerId}>
                      <td>{t.linha}</td>
                      <td>
                        <Selo mono semIcone>
                          {t.sellerId}
                        </Selo>
                      </td>
                      <td>
                        {t.tokenDe ? (
                          <Selo mono semIcone>
                            {t.tokenDe}
                          </Selo>
                        ) : (
                          <small>{t.erro ?? 'não respondeu'}</small>
                        )}
                      </td>
                      <td>
                        {t.confere ? (
                          <Selo nivel="bom">confere</Selo>
                        ) : (
                          <Selo nivel="critico">token de outra conta</Selo>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      </>
    );
  }

  const produto = await ehProdutoDeCatalogo(id).catch(() => null);

  if (produto) {
    const nome = produto.name ?? id;
    return (
      <>
        <Voltar />
        <h1>Isso é um produto de catálogo</h1>
        <p className="sub" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <Selo mono semIcone>
            {id}
          </Selo>
          <Selo nivel="atencao">não é um anúncio</Selo>
        </p>

        <section className="card">
          <h2>{nome}</h2>
          <p style={{ marginTop: 0 }}>
            Esse código é a <strong>página de catálogo</strong> do Mercado Livre, onde vários
            vendedores concorrem pelo mesmo produto. Ela não tem ficha para você preencher — a ficha
            do catálogo é do ML. Quem tem atributos, fotos e descrição sob seu controle é o{' '}
            <strong>seu anúncio</strong>.
          </p>
          <p>
            <Link className="btn primary" href={`/?q=${encodeURIComponent(nome.slice(0, 60))}`}>
              Procurar meus anúncios desse produto
            </Link>
          </p>
          <small>
            No link do catálogo, o código do seu anúncio costuma aparecer no final, em{' '}
            <code>?pdp_filters=item_id:MLB…</code> — colando esse link inteiro, o painel abre direto
            no anúncio certo.
          </small>
        </section>
      </>
    );
  }

  return (
    <>
      <Voltar />
      <section className="card">
        <h2>Não consegui carregar o anúncio</h2>
        <pre className="texto">{erro instanceof Error ? erro.message : String(erro)}</pre>
      </section>
    </>
  );
}

/**
 * Link para a página pública do anúncio.
 * O site usa o código com hífen depois do prefixo (MLB-70186190-...-_JM);
 * a API usa sem hífen. Sem essa conversão o link cai em página inexistente.
 */
function linkPublico(id: string): string {
  const m = id.match(/^([A-Z]{3})(\d+)$/);
  return m
    ? `https://produto.mercadolivre.com.br/${m[1]}-${m[2]}-_JM`
    : `https://www.mercadolivre.com.br/jm/search?as_word=${encodeURIComponent(id)}`;
}

function Voltar() {
  return (
    <p style={{ margin: '0 0 10px' }}>
      <Link href="/">← buscar outro anúncio</Link>
    </p>
  );
}
