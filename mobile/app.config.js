module.exports = {
  expo: {
    name: 'LedgerCraft',
    slug: 'easybizinvoice-mobile',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.easybizinvoice.app',
      associatedDomains: ['applinks:easybiz.iamjeevan.com'],
      config: {
        usesNonExemptEncryption: false,
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#ffffff',
      },
      package: 'com.easybizinvoice.app',
      versionCode: 1,
      intentFilters: [
        {
          action: 'VIEW',
          autoVerify: true,
          data: [
            {
              scheme: 'https',
              host: 'easybiz.iamjeevan.com',
              pathPrefix: '/shared/invoice/',
            },
          ],
          category: ['BROWSABLE', 'DEFAULT'],
        },
      ],
      permissions: [
        'CAMERA',
        'READ_MEDIA_IMAGES',
        'READ_EXTERNAL_STORAGE',
      ],
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
    },
    plugins: ['expo-secure-store', 'react-native-bottom-tabs'],
    scheme: 'easybizinvoice',
    extra: {
      eas: {
        projectId: '7148323b-502c-447e-96c3-a5c1704c40c9',
      },
    },
  },
};
