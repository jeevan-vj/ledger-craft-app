export const MAIN_TAB_ORDER = ['Dashboard', 'Invoices', 'Customers', 'Sell', 'More'] as const;

export type MainTabName = (typeof MAIN_TAB_ORDER)[number];

export function visibleMainTabs(quickSaleEnabled: boolean): MainTabName[] {
  return MAIN_TAB_ORDER.filter((tab) => tab !== 'Sell' || quickSaleEnabled);
}
