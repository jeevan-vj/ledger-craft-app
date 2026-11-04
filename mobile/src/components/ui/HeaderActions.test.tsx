import React from 'react';
import * as ReactNative from 'react-native';
import { StyleSheet, type ViewStyle } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme';
import { darkPalette, lightPalette, space } from '@/theme/tokens';
import { NativeHeaderButton } from './NativeHeaderButton';
import {
  HeaderActionButton,
  HeaderActions,
  ScreenHeaderBar,
  headerActionClusterWidth,
} from './HeaderActions';

function flatStyle(style: unknown): ViewStyle {
  const resolved = typeof style === 'function' ? style({ pressed: false }) : style;
  return StyleSheet.flatten(resolved as ViewStyle) ?? {};
}

function renderBar(
  saveLabel: string,
  title: string,
  handlers?: { onPreview?: () => void; onSave?: () => void; saveDisabled?: boolean },
) {
  const onPreview = handlers?.onPreview ?? jest.fn();
  const onSave = handlers?.onSave ?? jest.fn();
  const view = render(
    <SafeAreaProvider
      initialMetrics={{
        insets: { top: 0, right: 0, bottom: 0, left: 0 },
        frame: { x: 0, y: 0, width: 360, height: 800 },
      }}
    >
      <ThemeProvider>
        <ScreenHeaderBar
          title={title}
          left={<NativeHeaderButton label="Cancel" onPress={jest.fn()} />}
          right={(
            <HeaderActions>
              <HeaderActionButton label="Preview" tone="secondary" onPress={onPreview} />
              <HeaderActionButton
                label={saveLabel}
                tone="primary"
                disabled={handlers?.saveDisabled}
                onPress={onSave}
              />
            </HeaderActions>
          )}
        />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
  return { ...view, onPreview, onSave };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('split header actions', () => {
  it('draws Preview and Save as separate buttons with an 8pt gap, not one shared pill', () => {
    const { getByRole, getByTestId, getByText, onPreview, onSave } = renderBar('Save', 'New invoice');
    const group = getByTestId('header-actions');
    const groupStyle = flatStyle(group.props.style);
    const preview = getByRole('button', { name: 'Preview' });
    const save = getByRole('button', { name: 'Save' });
    const previewStyle = flatStyle(preview.props.style);
    const saveStyle = flatStyle(save.props.style);

    expect(groupStyle.gap).toBe(space.sm);
    expect(groupStyle.backgroundColor ?? 'transparent').toBe('transparent');
    expect(groupStyle.borderRadius).toBeUndefined();
    expect(previewStyle.minHeight).toBeGreaterThanOrEqual(44);
    expect(previewStyle.minWidth).toBeGreaterThanOrEqual(44);
    expect(saveStyle.minHeight).toBeGreaterThanOrEqual(44);
    expect(saveStyle.minWidth).toBeGreaterThanOrEqual(44);
    expect(saveStyle.backgroundColor).toBe(darkPalette.accent);
    expect(StyleSheet.flatten(getByText('Save').props.style).color).toBe(darkPalette.accentForeground);
    expect(previewStyle.backgroundColor).not.toBe(darkPalette.accent);
    expect(previewStyle.borderWidth).toBeGreaterThan(0);
    expect(preview).toHaveProp('accessibilityRole', 'button');
    expect(save).toHaveProp('accessibilityRole', 'button');

    fireEvent.press(save);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onPreview).not.toHaveBeenCalled();
    expect(getByRole('button', { name: 'Cancel' })).toBeTruthy();
    expect(getByRole('header', { name: 'New invoice' })).toBeTruthy();
  });

  it('keeps Save forest-on-lime in light mode and disables it without firing', () => {
    jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue('light');
    const onSave = jest.fn();
    const { getByRole, getByText } = renderBar('Update', 'Edit invoice', { onSave, saveDisabled: true });
    const save = getByRole('button', { name: 'Update' });
    const preview = getByRole('button', { name: 'Preview' });
    expect(flatStyle(save.props.style).backgroundColor).toBe(lightPalette.accent);
    expect(flatStyle(preview.props.style).borderColor).toBe(lightPalette.border);
    const label = getByText('Update');
    expect(StyleSheet.flatten(label.props.style).color).toBe(lightPalette.accentForeground);
    expect(StyleSheet.flatten(getByText('Preview').props.style).color).toBe(lightPalette.text);
    expect(save).toHaveProp('accessibilityState', { disabled: true });
    fireEvent.press(save);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('fits Cancel, the longest form title, Preview, and Update on a 360dp row', () => {
    expect(headerActionClusterWidth(['Preview', 'Update'])).toBeLessThanOrEqual(200);
    const width = headerActionClusterWidth(['Cancel', 'Edit estimate', 'Preview', 'Update'], {
      includeTitle: true,
    });
    expect(width).toBeLessThanOrEqual(360);
  });
});
