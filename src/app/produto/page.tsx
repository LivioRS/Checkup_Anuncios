import Link from 'next/link';
import type { Metadata } from 'next';
import styles from './produto.module.css';

export const metadata: Metadata = {
  title: 'Check-up de Anúncio — check-up completo dos seus anúncios do Mercado Livre',
  description:
    'Ficha técnica, título, descrição, imagens e criação via catálogo — tudo num painel só, com revisão antes de qualquer publicação.',
};

function IconeCheck() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconeFicha() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="3" width="14" height="18" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9 8h6M9 12h6M9 16h3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconeTendencia() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 16l5-5 4 4 7-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 6h5v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconeTexto() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 4h9l4 4v12a1 1 0 01-1 1H6a1 1 0 01-1-1V5a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M9 12h6M9 16h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconeImagem() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="9" cy="10.5" r="1.6" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5 17l4.5-4.5 3 3L17.5 10 20 12.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconeCatalogo() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
      <path d="M20.5 20.5L16.3 16.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M11 8v6M8 11h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconeContas() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="8.5" cy="8" r="3" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="16.5" cy="9.5" r="2.4" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 19c.6-3.3 2.9-5 5.5-5s4.9 1.7 5.5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M14.5 14.3c2.3.2 4 1.8 4.5 4.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconePausa() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1" stroke="currentColor" strokeWidth="1.8" />
      <rect x="14" y="5" width="4" height="14" rx="1" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function IconeRegistro() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 7v5l3.5 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function IconeConta() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 18c0-3.3 3.6-5 8-5s8 1.7 8 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="7.5" r="3.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

const RECURSOS = [
  {
    icone: <IconeFicha />,
    titulo: 'Ficha técnica automática',
    texto:
      'Compara os atributos do seu anúncio com os do produto de catálogo e aponta o que falta, diverge ou sobra — antes que isso vire reclamação.',
  },
  {
    icone: <IconeTendencia />,
    titulo: 'Título com tendências reais',
    texto:
      'Sugestões de título com base nos termos mais buscados no Mercado Livre para a categoria, sempre respeitando o limite de 60 caracteres.',
  },
  {
    icone: <IconeTexto />,
    titulo: 'Descrição assistida',
    texto:
      'Gera descrição com IA (opcional) mantendo fixos os blocos de "Sobre a loja" e "Garantia" — colados por código, nunca reescritos pelo modelo.',
  },
  {
    icone: <IconeImagem />,
    titulo: 'Diagnóstico de imagens',
    texto:
      'Confere resolução e tamanho de cada foto antes de baixar, pra imagem nunca sair pior do que a que já está publicada.',
  },
  {
    icone: <IconeCatalogo />,
    titulo: 'Criação via catálogo',
    texto:
      'Busca o produto certo por GTIN, marca ou modelo e cria o anúncio direto — sempre pausado até você revisar preço e quantidade.',
  },
  {
    icone: <IconeContas />,
    titulo: 'Multi-conta',
    texto:
      'Funciona com várias contas do Mercado Livre cadastradas. O painel identifica sozinho a conta dona de cada anúncio.',
  },
];

const PASSOS = [
  {
    titulo: 'Cole o código ou o link',
    texto: 'MLB, link do anúncio ou parte do título — o painel encontra e abre o check-up completo.',
  },
  {
    titulo: 'Veja o que precisa de atenção',
    texto: 'Ficha técnica, título, descrição e imagens, cada um com o que está bom e o que falta.',
  },
  {
    titulo: 'Corrija ou crie um anúncio novo',
    texto: 'Aplique as correções direto, ou monte um anúncio novo via catálogo — sempre pausado até você revisar.',
  },
];

const CONFIANCA = [
  {
    icone: <IconePausa />,
    titulo: 'Nunca publica sozinho',
    texto: 'Todo anúncio criado pelo painel nasce pausado. Ativar é sempre uma decisão sua, depois de revisar.',
  },
  {
    icone: <IconeRegistro />,
    titulo: 'Toda escrita fica registrada',
    texto: 'O que mudou, quando e em qual anúncio — cada correção e criação gera um registro de auditoria.',
  },
  {
    icone: <IconeConta />,
    titulo: 'Você continua no controle',
    texto: 'O painel sugere e prepara; a palavra final sobre preço, texto e publicação é sempre sua.',
  },
];

export default function Produto() {
  return (
    <div className={styles.pagina}>
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <span className={styles.kicker}>
            <span className={styles.dot} aria-hidden="true" />
            Feito para quem vende no Mercado Livre
          </span>
          <h1 className={styles.heroTitulo}>
            O check-up completo do seu <em>anúncio</em>, antes que o comprador ache o problema.
          </h1>
          <p className={styles.heroSub}>
            Ficha técnica, título, descrição, imagens e criação de anúncio via catálogo — num
            painel só, com revisão antes de qualquer publicação.
          </p>
          <div className={styles.heroAcoes}>
            <Link href="/" className={styles.btnPrimario}>
              Abrir o painel
            </Link>
            <Link href="/criar" className={styles.btnSecundario}>
              Criar um anúncio
            </Link>
          </div>
          <div className={styles.heroFaixa}>
            <span className={styles.heroFaixaItem}>
              <IconeCheck /> Sempre pausado até você revisar
            </span>
            <span className={styles.heroFaixaItem}>
              <IconeCheck /> Multi-conta Mercado Livre
            </span>
            <span className={styles.heroFaixaItem}>
              <IconeCheck /> Toda correção auditada
            </span>
          </div>
        </div>
      </section>

      <section className={styles.secao}>
        <div className={styles.secaoCabecalho}>
          <p className={styles.secaoKicker}>O que o painel faz</p>
          <h2 className={styles.secaoTitulo}>Cada parte do anúncio, checada de verdade</h2>
          <p className={styles.secaoSub}>
            Não é um checklist genérico — cada recurso lê os dados reais do seu anúncio e do
            catálogo do Mercado Livre.
          </p>
        </div>
        <div className={styles.grid}>
          {RECURSOS.map((r) => (
            <div className={styles.cartao} key={r.titulo}>
              <div className={styles.cartaoIcone}>{r.icone}</div>
              <h3>{r.titulo}</h3>
              <p>{r.texto}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.secao} style={{ paddingTop: 0 }}>
        <div className={styles.secaoCabecalho}>
          <p className={styles.secaoKicker}>Como funciona</p>
          <h2 className={styles.secaoTitulo}>Três passos, do código ao anúncio pronto</h2>
        </div>
        <div className={styles.passos}>
          {PASSOS.map((p, i) => (
            <div className={styles.passo} key={p.titulo}>
              <div className={styles.passoNumero}>{i + 1}</div>
              <h3>{p.titulo}</h3>
              <p>{p.texto}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.confianca}>
        <div className={styles.secao}>
          <div className={styles.secaoCabecalho}>
            <p className={styles.secaoKicker}>Segurança em primeiro lugar</p>
            <h2 className={styles.secaoTitulo}>O painel prepara. Você decide.</h2>
          </div>
          <div className={styles.confiancaGrid}>
            {CONFIANCA.map((c) => (
              <div className={styles.confiancaItem} key={c.titulo}>
                <div className={styles.confiancaIcone}>{c.icone}</div>
                <div>
                  <h3>{c.titulo}</h3>
                  <p>{c.texto}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className={styles.ctaFinal}>
        <h2>Pronto pra ver seus anúncios de novo?</h2>
        <p>Cole um código MLB e o check-up já começa.</p>
        <Link href="/" className={styles.btnPrimario}>
          Abrir o painel
        </Link>
      </div>

      <p className={styles.rodape}>
        Check-up de Anúncio é uma ferramenta interna, sem vínculo oficial com o Mercado Livre.
        Os dados exibidos vêm da API pública e das contas cadastradas pelo próprio usuário.
      </p>
    </div>
  );
}
