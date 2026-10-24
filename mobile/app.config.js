const appJson = require('./app.json');
const EAS_PROJECT_ID = '7148323b-502c-447e-96c3-a5c1704c40c9';

module.exports = {
  expo: {
    name: 'easybizinvoice',
    slug: 'easybizinvoice-mobile',
    version: appJson.expo.version,
    runtimeVersion: { policy: 'fingerprint' },
    updates: {
      url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
    },
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#1B262C',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.easybizinvoice.app',
      buildNumber: appJson.expo.ios.buildNumber,
      associatedDomains: ['applinks:easybiz.iamjeevan.com'],
      config: {
        usesNonExemptEncryption: false,
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#1B262C',
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
    plugins: [
      'expo-secure-store',
      'react-native-bottom-tabs',
      [
        '@sentry/react-native/expo',
        {
          url: 'https://us.sentry.io/',
          organization: 'ledgercraft',
          project: process.env.SENTRY_PROJECT || 'ledgercraft-mobile',
        },
      ],
      './plugins/withSentryUploadGate',
    ],
    scheme: 'easybizinvoice',
    extra: {
      eas: {
        projectId: EAS_PROJECT_ID,
      },
    },
  },
};
