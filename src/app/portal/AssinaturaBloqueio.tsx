import { Secao } from '@/components/ui';

/** Tela mostrada em `/portal/criar` e `/portal/lote` quando o trial acabou e não há assinatura ativa (plano 036, f3c6). */
export default function AssinaturaBloqueio({ titulo }: { titulo: string }) {
  return (
    <>
      <h1>{titulo}</h1>
      <Secao titulo="Período de teste encerrado">
        <p style={{ margin: 0 }}>
          Seu período de teste de 7 dias acabou. Assine no seu painel para continuar criando
          anúncios e rodando lotes.
        </p>
        <p style={{ margin: '12px 0 0' }}>
          <a className="btn primary" href="/portal/painel">
            Ir pro painel e assinar
          </a>
        </p>
      </Secao>
    </>
  );
}
