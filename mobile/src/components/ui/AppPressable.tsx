import React from 'react';
import { Pressable, type PressableProps, type View } from 'react-native';

/**
 * NativeWind v4's JSX runtime wraps every Pressable. css-interop reads `style`
 * as an object, so a callback is replaced with `{}` and background, padding,
 * radius, and pressed feedback never render (nativewind #1105, #1128, #847).
 *
 * `cssInterop={false}` is the supported opt-out. React Native still receives
 * the callback and applies pressed opacity and scale itself.
 */
export const AppPressable = React.forwardRef<View, PressableProps>(function AppPressable(props, ref) {
  return <Pressable ref={ref} {...props} cssInterop={false} />;
});
