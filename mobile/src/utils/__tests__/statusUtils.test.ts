import { describe, expect, it } from '@jest/globals';
import { darkPalette, lightPalette } from '@/theme/tokens';
import { statusActionColors, statusInk } from '../statusUtils';

describe('status colors', () => {
  it('keeps sent status readable on dark and light canvases', () => {
    expect(statusInk('sent', darkPalette)).toBe('#9FE870');
    expect(statusInk('sent', lightPalette)).toBe('#315E13');
    expect(statusInk('sent', darkPalette)).not.toBe('#163300');
  });

  it('puts forest ink on lime actions in both appearances', () => {
    for (const colors of [darkPalette, lightPalette]) {
      const sent = statusActionColors('sent', colors);
      expect(sent.background).toBe('#9FE870');
      expect(sent.foreground).toBe('#163300');
    }
    expect(statusActionColors('paid', darkPalette)).toEqual({
      background: '#9FE870',
      foreground: '#163300',
    });
    expect(statusActionColors('paid', lightPalette).foreground).toBe('#FFFFFF');
    expect(statusActionColors('overdue', lightPalette).background).toBe(lightPalette.danger);
    expect(statusInk('draft', darkPalette)).toBe(darkPalette.textSecondary);
  });
});