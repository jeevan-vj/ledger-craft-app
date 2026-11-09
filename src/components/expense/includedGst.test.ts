import { describe, expect, it } from 'vitest';
import { includedGst } from './includedGst';

describe('includedGst', () => {
  it('extracts 15% GST from a GST-inclusive receipt total', () => {
    expect(includedGst(115, 15)).toBe(15);
    expect(includedGst(10, 15)).toBe(1.3);
  });

  it('returns zero when there is no total or no rate', () => {
    expect(includedGst(0, 15)).toBe(0);
    expect(includedGst(115, 0)).toBe(0);
  });
});
