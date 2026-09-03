import type { Nivel } from '@/components/ui';

/**
 * Traduz o `?aviso=...` que o callback do OAuth (`/api/oauth/ml/callback`) põe na URL de volta
 * — pra um texto + nível de `Selo`. Compartilhado entre a tela admin `/clientes` (plano 022) e
 * o `/portal/painel` do cliente logado (plano 027, f3c1), que voltam pelo MESMO callback.
 */
export type AvisoOAuth = { nivel: Nivel; texto: string };

const FIXOS: Record<string, AvisoOAuth> = {
  conectado: { nivel: 'bom', texto: 'Conta do Mercado Livre conectada com sucesso.' },
  state_invalido: {
    nivel: 'critico',
    texto: 'Link de conexão inválido ou expirado — clique em "Conectar" de novo.',
  },
  faltando_code_ou_state: {
    nivel: 'critico',
    texto: 'Resposta incompleta do Mercado Livre — tente conectar de novo.',
  },
  sem_cadastro: {
    nivel: 'atencao',
    texto: 'Sua conta ainda não tem um cadastro de cliente vinculado. Fale com o suporte.',
  },
};

export function textoAviso(aviso: string | undefined): AvisoOAuth | null {
  if (!aviso) return null;
  if (FIXOS[aviso]) return FIXOS[aviso];
  if (aviso.startsWith('ml_negou:')) {
    return { nivel: 'atencao', texto: 'Autorização negada no Mercado Livre.' };
  }
  if (aviso.startsWith('troca_falhou:')) {
    return {
      nivel: 'critico',
      texto: `Falha ao trocar o código por token: ${aviso.slice('troca_falhou:'.length)}`,
    };
  }
  if (aviso.startsWith('conflito:')) {
    return { nivel: 'critico', texto: aviso.slice('conflito:'.length) };
  }
  return { nivel: 'atencao', texto: 'Algo não saiu como esperado.' };
}
