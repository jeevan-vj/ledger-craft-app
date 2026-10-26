import { describe, expect, it } from 'vitest';
import { csvCell } from './csv';

describe('csvCell', () => {
  it.each(['=1+1', '+cmd', '-cmd', '@SUM(A1)', '\tformula', '\rformula'])(
    'neutralises spreadsheet formula string %j',
    (value) => expect(csvCell(value)).toBe(value.startsWith('\r') ? `"'${value}"` : `'${value}`),
  );

  it('keeps numeric negative values numeric', () => {
    expect(csvCell(-12.5)).toBe('-12.5');
    expect(csvCell(true)).toBe('true');
  });

  it('keeps decimal money strings numeric but neutralises lookalikes', () => {
    expect(csvCell('-12.50')).toBe('-12.50');
    expect(csvCell('0.00')).toBe('0.00');
    expect(csvCell('-12.50+cmd')).toBe("'-12.50+cmd");
    expect(csvCell('-1e3')).toBe("'-1e3");
  });

  it('quotes commas, quotes, CR and LF after neutralising', () => {
    expect(csvCell('North, "Harbour"\r\n')).toBe('"North, ""Harbour""\r\n"');
    expect(csvCell('=HYPERLINK("https://example.test", "open")')).toBe(
      '"\'=HYPERLINK(""https://example.test"", ""open"")"',
    );
    expect(csvCell(null)).toBe('');
  });
});
