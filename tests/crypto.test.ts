import { afterEach, describe, expect, it } from 'vitest';
import { assinarSessao, verificarSessao, compararSenha, igualSegura } from '../src/lib/crypto';

afterEach(() => {
  delete process.env.PANEL_HMAC_SECRET;
  delete process.env.PANEL_PASSWORD;
});

describe('assinatura de sessão (painel)', () => {
  it('gera token válido e o middleware aceita', async () => {
    process.env.PANEL_HMAC_SECRET = 'segredo-teste';
    const cookie = await assinarSessao('senha-forte');
    expect(await verificarSessao(cookie, 'senha-forte')).toBe(true);
  });

  it('não é o hash puro da senha (antes era sha256(senha))', async () => {
    process.env.PANEL_HMAC_SECRET = 'segredo-teste';
    const cookie = await assinarSessao('senha-forte');
    // Formato "exp.sig", não um hex de 64 chars da senha.
    expect(cookie.split('.')).toHaveLength(2);
  });

  it('aceita token válido e rejeita adulterado', async () => {
    process.env.PANEL_HMAC_SECRET = 'segredo-teste';
    const cookie = await assinarSessao('senha-forte');
    const [exp] = cookie.split('.');
    const adulterado = `${exp}.${'0'.repeat(64)}`;
    expect(await verificarSessao(adulterado, 'senha-forte')).toBe(false);
  });

  it('rejeita token expirado', async () => {
    process.env.PANEL_HMAC_SECRET = 'segredo-teste';
    const antigo = await assinarSessao('senha-forte', 0); // emitido em 1970
    expect(await verificarSessao(antigo, 'senha-forte')).toBe(false);
  });

  it('rejeita cookie vazio / malformado', async () => {
    process.env.PANEL_HMAC_SECRET = 'segredo-teste';
    expect(await verificarSessao(undefined, 'x')).toBe(false);
    expect(await verificarSessao('sem-ponto', 'x')).toBe(false);
  });
});

describe('compararSenha', () => {
  it('aceita senha correta e rejeita errada', async () => {
    expect(await compararSenha('certa', 'certa')).toBe(true);
    expect(await compararSenha('errada', 'certa')).toBe(false);
  });
});

describe('igualSegura', () => {
  it('compara sem vazar informação por posição', () => {
    expect(igualSegura('abc', 'abc')).toBe(true);
    expect(igualSegura('abc', 'abd')).toBe(false);
    expect(igualSegura('abc', 'abcd')).toBe(false);
  });
});