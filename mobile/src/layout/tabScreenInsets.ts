export function getTabBarClearance(tabBarHeight: number, safeAreaBottom: number): number {
  return Math.max(tabBarHeight, safeAreaBottom, 0);
}

export function getTabScreenBottomPadding(
  tabBarHeight: number,
  safeAreaBottom: number,
  contentSpacing: number,
): number {
  return getTabBarClearance(tabBarHeight, safeAreaBottom) + Math.max(contentSpacing, 0);
}
