import React from 'react';
import { Alert, StyleSheet, type ViewStyle } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { interopComponents } from 'react-native-css-interop/dist/runtime/native/api';
// Production skips this registry when NODE_ENV is "test". Load it so preset
// pressables run through the same NativeWind Pressable wrapper as the app.
import 'react-native-css-interop/dist/runtime/components';
import BusinessSettingsScreen from './BusinessSettingsScreen';
import { businessProfileService, type BusinessProfile } from '@/services/businessProfileService';
import { DEFAULT_THEME, PRESET_THEMES } from '@/types/onboarding';
import { darkPalette } from '@/theme/tokens';

jest.mock('@/services/businessProfileService', () => ({
  businessProfileService: {
    getBusinessProfile: jest.fn(),
    updateBusinessProfile: jest.fn(),
  },
}));

jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context');
  return {
    ...actual,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

afterAll(() => {
  interopComponents.clear();
});

const profile: BusinessProfile = {
  id: 'profile-1',
  userId: 'user-1',
  name: 'LedgerCraft Studio',
  email: 'owner@example.com',
  country: 'New Zealand',
  invoiceNumberFormat: 'INV-{YYYY}-{SEQ}',
  invoiceNumberSequence: 1,
  createdAt: '2026-10-18T00:00:00.000Z',
  updatedAt: '2026-10-18T00:00:00.000Z',
  theme: DEFAULT_THEME,
};

function flatStyle(style: unknown): ViewStyle {
  const resolved = typeof style === 'function' ? style({ pressed: false }) : style;
  return StyleSheet.flatten(resolved as ViewStyle) ?? {};
}

async function openAppearance() {
  const view = render(<BusinessSettingsScreen />);
  fireEvent.press(await view.findByRole('tab', { name: 'Appearance' }));
  await view.findByRole('button', { name: 'Blue theme' });
  return view;
}

describe('Business settings appearance', () => {
  beforeEach(() => {
    (Alert.alert as jest.Mock).mockClear();
    (businessProfileService.getBusinessProfile as jest.Mock).mockResolvedValue(profile);
    (businessProfileService.updateBusinessProfile as jest.Mock).mockResolvedValue({
      ...profile,
      theme: PRESET_THEMES.purple,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('selects a preset and previews its colours', async () => {
    const view = await openAppearance();

    fireEvent.press(view.getByRole('button', { name: 'Purple theme' }));

    expect(view.getByRole('button', { name: 'Purple theme' })).toHaveProp('accessibilityState', {
      selected: true,
    });
    expect(view.getByRole('button', { name: 'Blue theme' })).toHaveProp('accessibilityState', {
      selected: false,
    });
    expect(flatStyle(view.getByLabelText('Theme preview header').props.style).backgroundColor).toBe(
      PRESET_THEMES.purple.primary,
    );
    expect(flatStyle(view.getByLabelText('Invoice theme preview').props.style).backgroundColor).toBe(
      PRESET_THEMES.purple.background,
    );
    expect(flatStyle(view.getByRole('button', { name: 'Purple theme' }).props.style).backgroundColor).toBe(
      darkPalette.surface,
    );
    expect(flatStyle(view.getByRole('button', { name: 'Purple theme' }).props.style).minHeight).toBeGreaterThanOrEqual(44);
  });

  it('edits a custom colour in the live preview', async () => {
    const view = await openAppearance();

    fireEvent.changeText(view.getByLabelText('Primary colour'), '#112233');

    expect(view.getByLabelText('Primary colour')).toHaveProp('value', '#112233');
    expect(flatStyle(view.getByLabelText('Theme preview header').props.style).backgroundColor).toBe('#112233');
    expect(view.getByRole('button', { name: 'Blue theme' })).toHaveProp('accessibilityState', {
      selected: false,
    });
  });

  it('rejects an invalid hex colour and does not save', async () => {
    const view = await openAppearance();

    fireEvent.changeText(view.getByLabelText('Accent colour'), 'green');
    expect(view.getByText('Enter a hex colour like #3B82F6.')).toBeTruthy();

    fireEvent.press(view.getByRole('button', { name: 'Save theme' }));

    expect(businessProfileService.updateBusinessProfile).not.toHaveBeenCalled();
    expect(view.getByText('Fix the highlighted colours before saving.')).toBeTruthy();
    expect(Alert.alert).toHaveBeenCalledWith(
      'Check colours',
      'Enter a hex colour like #3B82F6 for each field.',
    );
  });

  it('saves the selected theme through updateBusinessProfile', async () => {
    const view = await openAppearance();

    fireEvent.press(view.getByRole('button', { name: 'Green theme' }));
    fireEvent.changeText(view.getByLabelText('Surface colour'), '#F8FAFC');
    fireEvent.press(view.getByRole('button', { name: 'Save theme' }));

    await waitFor(() => {
      expect(businessProfileService.updateBusinessProfile).toHaveBeenCalledWith({
        theme: { ...PRESET_THEMES.green, surface: '#F8FAFC' },
      });
    });
    const saved = (businessProfileService.updateBusinessProfile as jest.Mock).mock.calls[0][0].theme as Record<string, string>;
    expect(saved).not.toHaveProperty('name');
    expect(await view.findByText('Invoice theme saved.')).toBeTruthy();
    expect(Alert.alert).toHaveBeenCalledWith('Theme saved', 'Your invoice colours were updated.');
  });

  it('shows an error when saving the theme fails', async () => {
    (businessProfileService.updateBusinessProfile as jest.Mock).mockRejectedValue(new Error('offline'));
    const view = await openAppearance();

    fireEvent.press(view.getByRole('button', { name: 'Save theme' }));

    expect(await view.findByText('Couldn’t save the invoice theme. Try again.')).toBeTruthy();
    expect(Alert.alert).toHaveBeenCalledWith(
      'Couldn’t save theme',
      'Couldn’t save the invoice theme. Try again.',
    );
  });
});
