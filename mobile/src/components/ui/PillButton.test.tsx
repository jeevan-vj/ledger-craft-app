import React from 'react';
import { render } from '@testing-library/react-native';
import { StyleSheet, type ViewStyle } from 'react-native';
import { interopComponents } from 'react-native-css-interop/dist/runtime/native/api';
// Production skips this registry when NODE_ENV is "test". Load it so the
// assertions run through the same Pressable wrapper as the app.
import 'react-native-css-interop/dist/runtime/components';
import { CircleIconButton } from './CircleIconButton';
import { AppPressable } from './AppPressable';
import { PillButton } from './PillButton';
import { darkPalette } from '@/theme/tokens';

afterAll(() => {
  interopComponents.clear();
});

function flatStyle(style: unknown): ViewStyle {
  return StyleSheet.flatten(style as ViewStyle) ?? {};
}

describe('Pressable styles under NativeWind', () => {
  it('paints a primary PillButton with the accent background', () => {
    const { getByRole } = render(<PillButton label="Continue" onPress={() => undefined} />);
    const button = getByRole('button', { name: 'Continue' });
    const style = flatStyle(button.props.style);

    expect(style.backgroundColor).toBe(darkPalette.accent);
    expect(style.minHeight).toBeGreaterThanOrEqual(44);
    expect(style.borderRadius).toBeGreaterThan(0);
    expect(style.paddingHorizontal).toBeGreaterThan(0);
  });

  it('keeps pressed opacity feedback when the style callback reports a press', () => {
    const { getByRole } = render(
      <AppPressable
        accessibilityRole="button"
        accessibilityLabel="Pressed pill"
        testOnly_pressed
        style={({ pressed }) => ({
          backgroundColor: darkPalette.accent,
          opacity: pressed ? 0.78 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        })}
      />,
    );
    const style = flatStyle(getByRole('button', { name: 'Pressed pill' }).props.style);
    expect(style.backgroundColor).toBe(darkPalette.accent);
    expect(style.opacity).toBeLessThan(1);
    expect(style.transform).toEqual([{ scale: 0.97 }]);
  });

  it('gives a circle icon button its well instead of a bare icon', () => {
    const { getByRole } = render(
      <CircleIconButton icon="eye" label="Hide balance" onPress={() => undefined} />,
    );
    const button = getByRole('button', { name: 'Hide balance' });
    const style = flatStyle(button.props.style);

    expect(style.width).toBe(44);
    expect(style.height).toBe(44);
    expect(style.borderRadius).toBe(22);
    expect(style.backgroundColor).toBe(darkPalette.surfaceRaised);
  });
});
