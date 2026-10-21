// Jest 30 rejects the lazy `require` inside Expo's WinterCG install when a suite
// later reads one of those globals. Swap the getters for real values first.
// Do not read the live globals here — that is what triggers the forbidden require.
function restoreWinterGlobal(name, fallback) {
  const backup = `original${name[0].toUpperCase()}${name.slice(1)}`;
  const value = Object.prototype.hasOwnProperty.call(global, backup) ? global[backup] : fallback();
  Object.defineProperty(global, name, {
    configurable: true,
    enumerable: true,
    writable: true,
    value,
  });
}

const nodeUrl = require('node:url');
const nodeUtil = require('node:util');
restoreWinterGlobal('TextDecoder', () => nodeUtil.TextDecoder);
restoreWinterGlobal('TextDecoderStream', () => class TextDecoderStream {});
restoreWinterGlobal('TextEncoderStream', () => class TextEncoderStream {});
restoreWinterGlobal('URL', () => nodeUrl.URL);
restoreWinterGlobal('URLSearchParams', () => nodeUrl.URLSearchParams);
restoreWinterGlobal('__ExpoImportMetaRegistry', () => ({ url: null }));
restoreWinterGlobal('structuredClone', () => nodeUtil.structuredClone ?? ((value) => JSON.parse(JSON.stringify(value))));

// Extend Jest with React Native Testing Library matchers
// Note: @testing-library/jest-native is deprecated, matchers are built-in since v12.4+
// No need to import extend-expect anymore

// Mock Expo SecureStore
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

// Mock Expo ImagePicker
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(() =>
    Promise.resolve({ status: 'granted', granted: true })
  ),
  requestCameraPermissionsAsync: jest.fn(() =>
    Promise.resolve({ status: 'granted', granted: true })
  ),
  launchImageLibraryAsync: jest.fn(() =>
    Promise.resolve({
      canceled: false,
      assets: [{ uri: 'file:///test-image.jpg' }],
    })
  ),
  launchCameraAsync: jest.fn(() =>
    Promise.resolve({
      canceled: false,
      assets: [{ uri: 'file:///test-camera-image.jpg' }],
    })
  ),
}));

// Mock Expo FileSystem
jest.mock('expo-file-system', () => ({
  readAsStringAsync: jest.fn(() => Promise.resolve('base64string')),
  EncodingType: {
    Base64: 'base64',
  },
}));

// Mock Expo Linking
jest.mock('expo-linking', () => ({
  createURL: jest.fn((path) => `exp://127.0.0.1:8081/${path}`),
}));

jest.mock('@expo/vector-icons', () => ({
  Feather: 'Feather',
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success' },
}));

// Mock React Native Alert. The public export is the module default.
jest.mock('react-native/Libraries/Alert/Alert', () => {
  const alert = jest.fn();
  return {
    __esModule: true,
    default: { alert },
    alert,
  };
});

// Silence console warnings in tests
global.console = {
  ...console,
  warn: jest.fn(),
  error: jest.fn(),
};

// Set test timeout
jest.setTimeout(10000);

