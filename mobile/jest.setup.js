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

// Mock React Native Alert
jest.mock('react-native/Libraries/Alert/Alert', () => ({
  alert: jest.fn(),
}));

// Mock React Native Platform
jest.mock('react-native/Libraries/Utilities/Platform', () => ({
  OS: 'ios',
  select: jest.fn((obj) => obj.ios || obj.default),
}));

// Silence console warnings in tests
global.console = {
  ...console,
  warn: jest.fn(),
  error: jest.fn(),
};

// Set test timeout
jest.setTimeout(10000);

