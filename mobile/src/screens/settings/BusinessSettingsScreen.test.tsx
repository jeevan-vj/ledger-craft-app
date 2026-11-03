import React from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, StyleSheet, type ViewStyle } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
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
    useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
  };
});

jest.mock('@react-navigation/elements', () => ({
  useHeaderHeight: () => 96,
}));

jest.mock('@/hooks/useTabScreenInsets', () => ({
  useTabScreenInsets: () => ({
    safeArea: { top: 47, bottom: 34, left: 0, right: 0 },
    tabBarHeight: 56,
    tabBarClearance: 56,
    bottomPadding: 90,
  }),
}));

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

const LOGO_UPLOAD_ERROR = 'The logo could not be uploaded. Use a JPG, PNG, or WebP image under 1 MB.';

describe('Business settings profile', () => {
  beforeEach(() => {
    (Alert.alert as jest.Mock).mockClear();
    (businessProfileService.getBusinessProfile as jest.Mock).mockReset();
    (businessProfileService.updateBusinessProfile as jest.Mock).mockReset();
    (businessProfileService.getBusinessProfile as jest.Mock).mockResolvedValue(profile);
    (businessProfileService.updateBusinessProfile as jest.Mock).mockResolvedValue(profile);
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted', granted: true });
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted', granted: true });
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{
        uri: 'content://media/external/images/media/42',
        mimeType: 'image/png',
        fileName: null,
        width: 1200,
        height: 800,
      }],
    });
  });

  it('loads saved values, saves an edit, and shows the reloaded value', async () => {
    const loaded = {
      ...profile,
      phone: '555-0100',
      city: 'Wellington',
      website: 'https://harbour.example',
    };
    (businessProfileService.getBusinessProfile as jest.Mock)
      .mockResolvedValueOnce(loaded)
      .mockResolvedValueOnce({ ...loaded, city: 'Auckland' });
    (businessProfileService.updateBusinessProfile as jest.Mock).mockResolvedValue({ ...loaded, city: 'Auckland' });
    const view = render(<BusinessSettingsScreen />);

    expect(await view.findByDisplayValue('LedgerCraft Studio')).toBeTruthy();
    expect(view.getByDisplayValue('owner@example.com')).toBeTruthy();
    expect(view.getByDisplayValue('555-0100')).toBeTruthy();
    expect(view.getByDisplayValue('Wellington')).toBeTruthy();
    expect(view.getByDisplayValue('https://harbour.example')).toBeTruthy();

    fireEvent.changeText(view.getByDisplayValue('Wellington'), 'Auckland');
    fireEvent.press(view.getByRole('button', { name: 'Save business profile' }));

    await waitFor(() => {
      expect(businessProfileService.updateBusinessProfile).toHaveBeenCalledWith(expect.objectContaining({
        businessName: 'LedgerCraft Studio',
        businessEmail: 'owner@example.com',
        city: 'Auckland',
        phone: '555-0100',
        website: 'https://harbour.example',
      }));
    });
    expect(await view.findByDisplayValue('Auckland')).toBeTruthy();
    expect(Alert.alert).toHaveBeenCalledWith('Success', 'Business profile updated successfully');
  });

  it('clears a phone number instead of keeping the previous one', async () => {
    (businessProfileService.getBusinessProfile as jest.Mock).mockResolvedValue({ ...profile, phone: '555-0100' });
    const view = render(<BusinessSettingsScreen />);
    fireEvent.changeText(await view.findByDisplayValue('555-0100'), '');
    fireEvent.press(view.getByRole('button', { name: 'Save business profile' }));

    await waitFor(() => {
      expect(businessProfileService.updateBusinessProfile).toHaveBeenCalledWith(expect.objectContaining({
        phone: null,
      }));
    });
  });

  it('lets gallery upload proceed when camera permission is denied', async () => {
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied', granted: false });
    const view = render(<BusinessSettingsScreen />);
    fireEvent.press(await view.findByRole('button', { name: 'Upload business logo' }));

    const chooser = (Alert.alert as jest.Mock).mock.calls.find((call) => call[0] === 'Upload Logo');
    expect(chooser).toBeTruthy();
    await chooser[2].find((button: { text: string }) => button.text === 'Gallery').onPress();

    expect(ImagePicker.requestCameraPermissionsAsync).not.toHaveBeenCalled();
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalled();
  });

  it('sends the picker mime type and shows the saved logo after reload', async () => {
    const savedLogo = 'data:image/png;base64,iVBORw0KGgo=';
    (businessProfileService.getBusinessProfile as jest.Mock)
      .mockResolvedValueOnce(profile)
      .mockResolvedValueOnce({ ...profile, logoUrl: savedLogo });
    (businessProfileService.updateBusinessProfile as jest.Mock).mockResolvedValue({ ...profile, logoUrl: savedLogo });
    const view = render(<BusinessSettingsScreen />);
    fireEvent.press(await view.findByRole('button', { name: 'Upload business logo' }));
    const chooser = (Alert.alert as jest.Mock).mock.calls.find((call) => call[0] === 'Upload Logo');
    await chooser[2].find((button: { text: string }) => button.text === 'Gallery').onPress();
    await waitFor(() => {
      expect(view.UNSAFE_getAllByType(Image).some((image) => image.props.source?.uri === 'content://media/external/images/media/42')).toBe(true);
    });
    fireEvent.press(view.getByRole('button', { name: 'Save business profile' }));

    await waitFor(() => {
      expect(businessProfileService.updateBusinessProfile).toHaveBeenCalledWith(expect.objectContaining({
        logo: expect.objectContaining({
          uri: 'content://media/external/images/media/42',
          mimeType: 'image/png',
        }),
      }));
    });
    await waitFor(() => {
      expect(view.UNSAFE_getAllByType(Image).some((image) => image.props.source?.uri === savedLogo)).toBe(true);
    });
    expect(Alert.alert).toHaveBeenCalledWith('Success', 'Business profile updated successfully');
  });

  it('shows the logo upload error and does not claim the profile was saved', async () => {
    (businessProfileService.updateBusinessProfile as jest.Mock).mockRejectedValue(new Error(LOGO_UPLOAD_ERROR));
    const view = render(<BusinessSettingsScreen />);
    fireEvent.press(await view.findByRole('button', { name: 'Upload business logo' }));
    const chooser = (Alert.alert as jest.Mock).mock.calls.find((call) => call[0] === 'Upload Logo');
    await chooser[2].find((button: { text: string }) => button.text === 'Gallery').onPress();
    await waitFor(() => {
      expect(view.UNSAFE_getAllByType(Image).length).toBeGreaterThan(0);
    });
    fireEvent.press(view.getByRole('button', { name: 'Save business profile' }));

    expect(await view.findByText(LOGO_UPLOAD_ERROR)).toBeTruthy();
    expect(Alert.alert).toHaveBeenCalledWith('Logo wasn’t saved', LOGO_UPLOAD_ERROR);
    expect(Alert.alert).not.toHaveBeenCalledWith('Success', 'Business profile updated successfully');
  });

  it('clears the tab bar once and offsets the keyboard by the header height', async () => {
    const view = render(<BusinessSettingsScreen />);
    const bar = await view.findByTestId('business-settings-save-bar');
    const padding = flatStyle(bar.props.style).paddingBottom;
    expect(padding).toBe(Math.max(56, 34));
    expect(padding).toBeLessThan(56 + 34);
    const keyboard = view.UNSAFE_getByType(KeyboardAvoidingView);
    expect(keyboard.props.keyboardVerticalOffset).toBe(96);
    expect(keyboard.props.behavior).toBe(Platform.OS === 'ios' ? 'padding' : undefined);
  });
});
