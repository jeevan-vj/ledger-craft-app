import { useBottomTabBarHeight } from 'react-native-bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getTabBarClearance, getTabScreenBottomPadding } from '@/layout/tabScreenInsets';
import { space } from '@/theme/tokens';

export function useTabScreenInsets(contentSpacing = space.xl) {
  const tabBarHeight = useBottomTabBarHeight();
  const safeArea = useSafeAreaInsets();
  const tabBarClearance = getTabBarClearance(tabBarHeight, safeArea.bottom);

  return {
    safeArea,
    tabBarClearance,
    bottomPadding: getTabScreenBottomPadding(tabBarHeight, safeArea.bottom, contentSpacing),
  };
}
