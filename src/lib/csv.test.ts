import { describe, expect, it } from 'vitest';
import { csvCell, csvRow } from './csv';

describe('browser CSV escaping', () => {
  it('neutralises formula strings without changing numeric negatives', () => {
    expect(csvCell('=HYPERLINK("https://example.test")')).toBe('"\'=HYPERLINK(""https://example.test"")"');
    expect(csvRow(['@SUM(A1)', -12.5])).toBe("'@SUM(A1),-12.5");
  });
});
