import { dateForPreset } from './datePickerModel';

describe('date picker presets', () => {
  it('calculates bill terms from the supplied bill date', () => {
    expect(dateForPreset(30, '2026-11-10')).toBe('2026-12-10');
  });

  it('never returns a preset before the minimum date', () => {
    expect(dateForPreset(0, '2026-10-01', '2026-11-10')).toBe('2026-11-10');
  });
});
