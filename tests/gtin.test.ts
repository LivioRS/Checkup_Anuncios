import { describe, expect, it } from 'vitest';
import { gtinChecksumOk } from '../src/lib/gtin';

describe('gtinChecksumOk', () => {
  it('aceita EAN-13 válido (KIKO300-RRT, conferido à mão)', () => {
    expect(gtinChecksumOk('4549763352750')).toBe(true);
  });

  it('recusa EAN-13 com dígito verificador errado (caso real que o ML recusou)', () => {
    expect(gtinChecksumOk('4549763308381')).toBe(false);
  });

  it('ignora formatação (espaços, hífens)', () => {
    expect(gtinChecksumOk('454-9763 352750')).toBe(true);
  });

  it('não valida comprimento fora de {8,12,13,14} — devolve null, não false', () => {
    expect(gtinChecksumOk('123')).toBeNull();
    expect(gtinChecksumOk('')).toBeNull();
  });

  it('aceita UPC-A (12 dígitos) e EAN-8 válidos', () => {
    expect(gtinChecksumOk('036000291452')).toBe(true); // UPC-A conhecido
    expect(gtinChecksumOk('96385074')).toBe(true); // EAN-8 conhecido
  });
});
