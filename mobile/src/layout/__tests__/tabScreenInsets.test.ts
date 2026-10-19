import { describe, expect, it } from '@jest/globals';
import { getTabBarClearance, getTabScreenBottomPadding } from '../tabScreenInsets';

describe('tab screen insets', () => {
  it('uses the measured native tab bar when it is taller than the safe area', () => {
    expect(getTabBarClearance(82, 34)).toBe(82);
    expect(getTabScreenBottomPadding(82, 34, 20)).toBe(102);
  });

  it('falls back to the safe area while the native tab bar is not measured', () => {
    expect(getTabBarClearance(0, 34)).toBe(34);
    expect(getTabScreenBottomPadding(0, 34, 20)).toBe(54);
  });

  it('always preserves the requested content breathing room', () => {
    expect(getTabScreenBottomPadding(0, 0, 20)).toBe(20);
  });
});
