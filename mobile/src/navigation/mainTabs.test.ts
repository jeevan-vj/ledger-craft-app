import { readFileSync } from 'node:fs';
import path from 'node:path';
import { visibleMainTabs } from './mainTabs';

describe('visibleMainTabs', () => {
  it('hides Sell until quick sale is on, then shows it as the fifth tab before More', () => {
    expect(visibleMainTabs(false)).toEqual(['Dashboard', 'Invoices', 'Customers', 'More']);
    expect(visibleMainTabs(true)).toEqual(['Dashboard', 'Invoices', 'Customers', 'Sell', 'More']);
  });

  it('wires the Sell screen from the same switch on native and web', () => {
    for (const file of ['AppNavigator.tsx', 'AppNavigator.web.tsx']) {
      const source = readFileSync(path.join(__dirname, file), 'utf8');
      expect(source).toContain('useQuickSaleEnabled');
      expect(source).toContain('name="Sell"');
      expect(source).toContain('SellNavigator');
    }
    const native = readFileSync(path.join(__dirname, 'AppNavigator.tsx'), 'utf8');
    expect(native).not.toMatch(/tabBarStyle/);
  });
});
